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

# ---------- 包体联网特征清理（2026-11-07 · 审核驳回整改）----------
# src/ai-player.js 是本地 AI 试跑工具，index.html **从未引用**；内含一个死 fetch('/__ai-status')，
# 会被平台静态扫描判成「联网功能」。源码留在仓库（本地调试还要用），只从包体排除。
# ⚠️ 排除必须放在 _sync_tree 之后：放前面会被下一轮同步原样复制回来。
_AI_TOOL = os.path.join(SRC, 'src', 'ai-player.js')
if os.path.isfile(_AI_TOOL):
    try: os.remove(_AI_TOOL)
    except OSError: pass
assert not os.path.exists(_AI_TOOL), '包内 ai-player.js 没排干净（会被扫成联网功能）'
print('已排除未被 index.html 引用的 src/ai-player.js（含死 fetch）')

# ---------- 运行时素材 ----------
# ⚠️ 2026-10-26 修复（严重的静默缺图）：原脚本只同步 tech-icons / civic-icons 两个子树，
#   导致包内 assets 只有 4 个目录（backgrounds/tech-icons/civic-icons/wonders），
#   而实际被引用的还有 fonts（标题字体 Ma_Shan_Zheng）、building-icons（69 处）、
#   resource-icons（34 处）、achievements（22 处）、ui-era、talent-icons、challenges、
#   company-icons、brand、dyson —— 线上是 404 缺图，而封包断言只查 config.js 文本、
#   完全查不出来。改为按白名单遍历，**排除 assets/store（66M 本地商店素材，不上传）**。
ASSET_DIRS = ['achievements', 'audio', 'backgrounds', 'brand', 'building-icons', 'challenges',
              'civic-icons', 'company-icons', 'dyson', 'faith-tenets', 'fonts', 'resource-icons',
              'talent-icons', 'tech-icons', 'ui-era', 'war', 'wonders']
# ⚠️ 2026-10-31 新增 audio（BGM 压缩包，见 src/audio.js + CFG.AUDIO）。漏进白名单 = 线上静默缺音乐，
#    与 2026-10-26「静默缺图」同类事故：封包断言只查 config 文本，查不出缺整个文件夹。
# ⚠️ 2026-11-09 新增 faith-tenets（31 张信条图标 / 0.9 MB，见 src/faith.js + docs/FAITH_TENET_ICONS.md）。
#    11-06 信条系统入库时漏登记本白名单 ⇒ rc43~rc47 五个包全部缺整个目录、31 个图标全 404；
#    玩家看到「图标一直闪」（renderPanes 每 2 秒整块重写 innerHTML，img 反复重建反复 404）。
#    这是 10-26 的同构复发第二次，光加白名单只修当前一次，下方守卫已同步改成反向校验。
# ⚠️ 2026-11-12 新增 war（7 张敌国肖像，见 src/ui/render-pane-war.js:36 enemyPortraitUrl）。
#    战争系统 11-11 入库时又漏登记本白名单 ⇒ 反向校验会当场拦下封包（rc49 之前没打过含战争的包）。
#    这是同构复发第三次：反向守卫正确报错，修法是补白名单，不是放宽守卫。
for _d in ASSET_DIRS:
    _sync_tree(os.path.join(REPO, 'assets', _d), os.path.join(SRC, 'assets', _d))
print('已自动同步 assets/ 的 %d 个子树 -> 包目录（store 本地素材除外）' % len(ASSET_DIRS))

# ⚠️ 2026-11-05：破壳分镜的 engraved-v1/v2/v3 是**未定稿草案**（15 个文件 / 约 38 MB），
#    生产代码仍引用旧图（sequence/era-5/frame-0*.webp + breakthrough/end-stars-draft-low.jpg）。
#    backgrounds 是整目录白名单同步，不排除会把这些未引用素材一起打进包（57 MB → 95 MB）。
#    ⚠️ 排除必须放在同步**之后**：放前面会被下一轮 _sync_tree 原样复制回来。
#    将来若正式启用某一版分镜，改这里保留对应目录，并同步补上代码引用与 ?v bump。
_BR = os.path.join(SRC, 'assets', 'backgrounds', 'breakthrough')
_DRAFT_DIRS = [os.path.join(_BR, d) for d in sorted(os.listdir(_BR))
               if d.startswith('engraved-v') and os.path.isdir(os.path.join(_BR, d))]
for _draft in _DRAFT_DIRS:
    shutil.rmtree(_draft, ignore_errors=True)
assert not [d for d in os.listdir(_BR) if d.startswith('engraved-v')], '未定稿分镜草案目录没排干净'
print('已排除未定稿分镜草案目录 %d 个：%s' %
      (len(_DRAFT_DIRS), ', '.join(os.path.basename(d) for d in _DRAFT_DIRS) or '无'))

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
# 排行榜 12 个 ID 必须已回填（2026-10-26 于现行主体 996563 重建 9 个；
#   2026-10-31 补 drift；2026-11-07 补 pollution / dysonrush）
#   旧 963517 的 7 个 ID 已作废——996563 上 list_leaderboards 曾返回 0 条）
# ⚠️ 同广告位坑：rank.js 无 ID 时不提交且入口隐藏 ⇒ 空串包 = 榜功能静默消失。
LB_IDS = ('wk8s9lkm23g2eihkz8', 'zgq97kctyiqffhcr9p', 'riikrs1jp5m6a1nyjy',
          'ew5xr8ex1y75ndd9kd', 'dl64gq9ao80hvnn5j8', '3o19a9rpfhm8bnbe94',
          'peq757lhctr3dqzx8j', 'bvn169c2u30f2xhmqj', '6bi4710gm6oswyed0m',
          'jqqgofg5g3tvb1uxwz', 'a2bcbiqjfc59e29uel', 'pqfonhv7uvjrdcxl4e')
missing = [i for i in LB_IDS if i not in body]
assert not missing, f'包内 config.js 的 RANK.LB 缺榜 ID: {missing}，先同步源码'
print('打包前置检查: OK (500000 + cache-buster + 无手动倍速 + 广告按钮 + 壳厚迁移 + 广告位1054324 + dev口收紧 + 排行榜12ID)')

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
assert "VERSION: 'Ver1.1.1'" in _cfg, '包内 config.js 版本号不是 Ver1.1.1'

# ---------- 更新日志本地化守卫（2026-11-06） ----------
# CFG.CHANGELOG 的 items 已全部改成 i18n 语义 key：中文基准在
# src/locales/zh-CN.js（进 TapTap 包），英文在 electron/locales/en-US.js
#（Electron 专属，按规范不进包，故从 REPO 读）。旧守卫逐字搜中文串，
# key 化后必然失效，这里改成「结构 + key + 双语资源」四重校验：
#   ① 19 个版本都在（Ver1.1.1 + Ver1.1.0 + Ver1.0.17…Ver1.0.1），CHANGELOG 段剥注释后不含任何汉字（无中文硬编码回潮）；
#   ② 恰 111 条语义 key、互不重复；
#   ③ 包内 zh-CN 与仓库 en-US 都含这 111 个 key 且译文非空；
#   ④ 中英文都没有未烘焙的 {placeholder}，且废弃的机械 key 不再被引用。
import re as _re
import json as _json

# Ver1.0.18 / Ver1.0.19 只封包、从未上线，已收编进 Ver1.1.0 段，不再作为独立段存在。
_expected_versions = ['Ver1.1.1', 'Ver1.1.0'] + ['Ver1.0.%d' % _n for _n in range(17, 0, -1)]
for _v in _expected_versions:
    assert "v: '%s'" % _v in _cfg, '包内 config.js 更新日志缺 %s 条目' % _v

_chg_start = _cfg.index('CHANGELOG:')
_chg_start = _cfg.index('[', _chg_start)
_depth = 0
_chg_end = None
for _i in range(_chg_start, len(_cfg)):
    if _cfg[_i] == '[':
        _depth += 1
    elif _cfg[_i] == ']':
        _depth -= 1
        if _depth == 0:
            _chg_end = _i
            break
assert _chg_end, '包内 config.js 的 CHANGELOG 数组括号不配对'
_chg_body = _cfg[_chg_start:_chg_end]
_chg_code = _re.sub(r'/\*.*?\*/', '', _chg_body, flags=_re.S)
_chg_code = _re.sub(r'//[^\n]*', '', _chg_code)
assert not _re.search(r'[\u4e00-\u9fff]', _chg_code), \
    '包内 config.js 的 CHANGELOG 仍残留中文硬编码条目（应先登记再引用 key）'
_chg_keys = _re.findall(r"'((?:changelog|ui\.footer)\.[a-z0-9_.]+)'", _chg_body)
assert len(_chg_keys) == 111, '包内 config.js 更新日志 key 数应为 111，实为 %d' % len(_chg_keys)
assert len(set(_chg_keys)) == 111, '包内 config.js 更新日志有重复 key'

def _strip_js_block_comments(_txt):
    """词库是 JS 对象字面量，允许 /* */ 注释；json.loads 不接受。
    只在字符串外剥注释（扫描时跟踪引号与反斜杠转义），避免误伤文案里出现的 '/*'。
    ⚠️ 2026-11-12：战争/传承批次在两本词库的 Object.freeze 体内插了 14 处口径注释，
       rc49 首次封包当场被 JSONDecodeError 拦下。这些注释是合法 JS、且是有价值的判据，
       该改的是解析假设（与 11-07 尾逗号同类），不是删注释、也不是放宽断言。"""
    _out, _i, _n, _quote = [], 0, len(_txt), None
    while _i < _n:
        _c = _txt[_i]
        if _quote:
            _out.append(_c)
            if _c == '\\' and _i + 1 < _n:
                _out.append(_txt[_i + 1])
                _i += 2
                continue
            if _c == _quote:
                _quote = None
            _i += 1
            continue
        if _c in ('"', "'"):
            _quote = _c
            _out.append(_c)
            _i += 1
            continue
        if _c == '/' and _i + 1 < _n and _txt[_i + 1] == '*':
            _j = _txt.find('*/', _i + 2)
            _i = _n if _j < 0 else _j + 2
            continue
        _out.append(_c)
        _i += 1
    return ''.join(_out)


def _locale_dict(_path):
    with open(_path, encoding='utf-8') as _f:
        _txt = _f.read()
    _m = _re.search(r'Object\.freeze\((\{.*\})\);', _txt, _re.S)
    assert _m, '词库格式异常（读不到 Object.freeze）: ' + _path
    _body = _strip_js_block_comments(_m.group(1))
    try:
        _d = _json.loads(_body)
    except _json.JSONDecodeError:
        # ⚠️ 2026-11-07：export_i18n_runtime.py 生成的词库是 JS 对象字面量，
        #    允许「最后一项后多一个逗号」；json.loads 不接受，会直接把封包堵死。
        #    词库是扁平对象，尾逗号只可能紧邻结尾的 }，只削这一处、不碰字符串内部。
        _d = _json.loads(_re.sub(r',(\s*\})\s*$', r'\1', _body))
    print('  词库解析 %s -> %d keys' % (os.path.basename(_path), len(_d)))
    return _d

_zh_locale = _locale_dict(os.path.join(SRC, 'src', 'locales', 'zh-CN.js'))
_en_locale = _locale_dict(os.path.join(REPO, 'electron', 'locales', 'en-US.js'))
for _k in _chg_keys:
    assert _k in _zh_locale and str(_zh_locale[_k]).strip(), '包内 zh-CN 词库缺日志中文: ' + _k
    assert _k in _en_locale and str(_en_locale[_k]).strip(), '仓库 en-US 词库缺日志英文: ' + _k
    assert not _re.search(r'\{[A-Za-z0-9_]+\}', str(_zh_locale[_k])), '中文日志有未烘焙占位符: ' + _k
    assert not _re.search(r'\{[A-Za-z0-9_]+\}', str(_en_locale[_k])), '英文日志有未烘焙占位符: ' + _k

_idx = _read('index.html')
for _old_key in ['ui.render.anonymous_function.leaderboard',
                 'ui.render.anonymous_function.changelog']:
    assert _old_key not in _idx, '包内 index.html 仍引用已废弃的机械 key: ' + _old_key
for _new_key in ['ui.footer.leaderboard_button', 'ui.footer.changelog_button']:
    assert _new_key in _idx, '包内 index.html 缺页脚语义 key: ' + _new_key
assert '活动礼包码直接领取' not in _cfg, '包内 config.js 仍残留礼包码那条公开日志（用户要求删）'
print('更新日志本地化守卫: OK (19 版本 / 111 key / zh-CN + en-US 双语齐全 / 无占位符 / 无废弃 key)')

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
# ⚠️ 2026-11-08：源码在 !fsAvailable 分支内新增了 Auto-Cloud 优先子分支（L272-275），
#   导致原本「if (!fsAvailable()) { 紧接 if (!syncStorageAvailable())」的紧挨字符串断言失效。
#   改用 writeNativeSave 函数体窗口 + 顺序判定：只要 kv 兜底门仍在 !fsAvailable 分支之后即视为
#   守卫生效，语义不变（fs 不可用时 kv 落盘仍可达，不会整段早退）。
_wi = _ss3.find('function writeNativeSave(')
assert _wi >= 0, '包内 save-storage.js 缺 writeNativeSave'
_wns_end = _ss3.find('function flushNativeSync(')
assert _wns_end > _wi, '包内 save-storage.js 缺 flushNativeSync（无法界定 writeNativeSave 体）'
_wns = _ss3[_wi:_wns_end]
assert 'if (!fsAvailable())' in _wns, '包内 writeNativeSave 缺 !fsAvailable 分支'
_kv_gate = 'if (!syncStorageAvailable()) return Promise.resolve(false)'
assert _kv_gate in _wns, \
    '包内 writeNativeSave 在 !fsAvailable() 分支缺 kv 兜底门（整段早退会掐死 kv 落盘）'
assert _wns.find(_kv_gate) > _wns.find('if (!fsAvailable())'), \
    '包内 writeNativeSave 的 kv 兜底门不在 !fsAvailable 分支内'
assert 'autoPumpTimer' in _read('src/save-transfer.js'), \
    '包内云备份定时器不是幂等的（就绪门重入会装出两个 30 秒定时器）'
print('就绪门入包检查: OK (三态判别 + 超时暂停/local 放行 + 写保护 + 晚到补偿 + 定时器幂等)')

# ---------- 包内素材必须齐全 ----------
# 2026-10-26：白名单逐个同步，加「白名单内目录存在且非空」的正向检查。
# ⚠️ 2026-11-09：正向守卫只自查 ASSET_DIRS，漏登记的新目录根本不在检查集合里 ⇒
#    rc43~rc47 五个包全打印「素材检查: OK」而线上 31 个信条图标全 404（同构复发第二次）。
#    故补**反向校验**：从包内源码实际引用的 assets/<dir>/ 反推「应该有哪几个目录」，
#    再逐个断言包内存在且非空。漏登记 / 没同步 / 空目录，三者任一都当场封包失败。
#    口径：扫包内 index.html + src/**/*.{js,html} + css/**/*.css（这才是真正发出去的代码）；
#          先剥块注释与整行 // 注释（防文档里的路径造成假警报），不剥行内 // 以免误伤字符串。
#    ⚠️ assets/store 是本地商店素材、故意排除；若哪天代码引用了它，本守卫会**正确报错**——
#       那意味着线上必然 404，该修的是引用，不是把 store 塞进包（410 MB）。
def _assert_assets(_src_root, _whitelist):
    """反向校验包内源码引用的每个 assets 一级目录都已登记且真的在包里。
    写成具名函数，便于 tmp/ 下的探针直接 exec 生产函数本体做回归，不复制逻辑。"""
    import os as _os, re as _re, glob as _glob
    _src_files = []
    for _pat in ('index.html', 'src/**/*.js', 'src/**/*.html', 'css/**/*.css'):
        _src_files += _glob.glob(_os.path.join(_src_root, _pat), recursive=True)
    assert _src_files, '包内找不到待扫描的源码文件（assets 反向校验无法执行）'
    _ref_dirs = set()
    for _p in _src_files:
        with open(_p, encoding='utf-8', errors='replace') as _f:
            _txt = _f.read()
        _txt = _re.sub(r'/\*.*?\*/', '', _txt, flags=_re.S)
        _txt = _re.sub(r'(?m)^\s*//.*$', '', _txt)
        _ref_dirs |= set(_re.findall(r'assets/([A-Za-z0-9_-]+)/', _txt))
    _unlisted = sorted(_ref_dirs - set(_whitelist))
    assert not _unlisted, (
        '包内源码引用了未登记进 ASSET_DIRS 的 assets 目录: %s —— '
        '漏登记 = 线上静默 404 缺图，先把目录加进白名单再封包' % _unlisted)
    _missing_assets = []
    for _d in sorted(_ref_dirs | set(_whitelist)):
        _p = _os.path.join(_src_root, 'assets', _d)
        if not _os.path.isdir(_p) or not _os.listdir(_p):
            _missing_assets.append(_d)
    assert not _missing_assets, f'包内 assets 缺目录或为空: {_missing_assets}，先同步素材'
    assert _os.path.isfile(_os.path.join(_src_root, 'assets', 'fonts', 'Ma_Shan_Zheng.woff2')), \
        '包内缺标题字体 Ma_Shan_Zheng.woff2'
    return {'scanned': len(_src_files), 'refDirs': sorted(_ref_dirs), 'whitelist': len(_whitelist)}

_asset_report = _assert_assets(SRC, ASSET_DIRS)
print('素材检查: OK (白名单 %d 个子树 + 源码反向引用 %d 个目录全部在位 + 标题字体在位，扫 %d 个源码文件)'
      % (len(ASSET_DIRS), len(_asset_report['refDirs']), _asset_report['scanned']))

# ---------- 包体零外部特征（2026-11-08 收紧口径）----------
# ⚠️ 2026-11-08 教训：旧守卫只扫 .js/.html/.css/.mjs/.json 的「有效行」并主动剥掉
#    纯注释行，两处真实残留都漏了 ——
#      ① assets/ui-era/era5-pipe-header.png 的 caBX 块内嵌 C2PA 证书 URL
#         （ca.trufo.ai / cv.iptc.org）—— 二进制文件根本没进扫描范围；
#      ② 注释里「送审包被静态扫描判为含联网功能 → 需办 ICP 核准」这类自述 —— 被剥注释漏掉。
#    审核侧既不剥注释，也不挑扩展名。故口径收紧为：
#      ① 扫 SRC 下**所有文件**的原始字节，不限扩展名、不剥注释；
#      ② 唯一白名单 = http(s)://www.w3.org/2000/svg（SVG 命名空间字符串，不是请求）；
#      ③ 额外钉死自述字样：包里不许出现会让人以为存在联网能力的说明文本；
#      ④ tap.* 平台服务 API 只**清点并打印**，不作失败判据（官方口径不算联网游戏）。
#    收紧 CSP 时仍别把 'unsafe-inline' / blob: data: 删掉 —— 星图有 6 段内联 <script>，
#    删掉就是 iframe 白屏。
import re as _re
_FETCH_B = _re.compile(rb'\bfetch\s*\(')
_EXTURL_B = _re.compile(rb'https?://(?!www\.w3\.org/2000/svg)')
_SELF_TELL_B = _re.compile(r'联网功能|ICP\s*核准|静态扫描|网络请求|零网络'.encode('utf-8'))
_TAP_NET_B = _re.compile(
    rb'\b(?:root\.)?tap\.(getCloudSaveManager|createAchievementManager|'
    rb'createRewardedVideoAd|getLeaderboardManager)')
# ---------- 包体剔除：assets 下的开发文档（.md 文案/填报清单，非运行时资源）----------
# ⚠️ 2026-11-08：assets/achievements 里混入了 3 份开发文档（Steam 成就填报清单 / 填报清单 /
#   成就文案），它们不是游戏运行时资源，却被 ASSET_DIRS 白名单整体 sync 进包；其中
#   Steam成就填报清单_v0.1.md 含 partner.steamgames.com 外部链接，触发「零外部特征」扫描。
#   这些文档应归位到 docs/，此处仅从包体剔除（不动仓库文件）。
for _ad in ('Steam成就填报清单_v0.1.md', '填报清单.md', '成就文案_v0.1.md'):
    _adp = os.path.join(SRC, 'assets', 'achievements', _ad)
    if os.path.isfile(_adp):
        try: os.remove(_adp)
        except OSError: pass
_net_hits, _self_hits, _tap_net_count = [], [], 0
for _nroot, _ndirs, _nfiles in os.walk(SRC):
    for _nfn in _nfiles:
        _np = os.path.join(_nroot, _nfn)
        with open(_np, 'rb') as _nf:
            _blob = _nf.read()
        _rel = os.path.relpath(_np, SRC).replace(os.sep, '/')
        for _m in _FETCH_B.finditer(_blob):
            _net_hits.append('%s@%d fetch(' % (_rel, _m.start()))
        for _m in _EXTURL_B.finditer(_blob):
            _sample = _blob[_m.start():_m.start() + 56].decode('latin1').split()[0]
            _net_hits.append('%s@%d %s' % (_rel, _m.start(), _sample))
        for _m in _SELF_TELL_B.finditer(_blob):
            _self_hits.append('%s@%d %s' % (_rel, _m.start(), _m.group().decode('utf-8', 'replace')))
        _tap_net_count += len(_TAP_NET_B.findall(_blob))
assert not _net_hits, '包内仍有 fetch / 非白名单外部 URL：%s' % ', '.join(_net_hits[:8])
assert not _self_hits, '包内仍有联网自述字样：%s' % ', '.join(_self_hits[:8])
_rd = _read('src/redeem.js')
assert "api: ''" in _rd, '包内 redeem.js 缺平台通道下线锚点（可能又活了）'
assert 'function platformReady() { return false; }' in _rd, '包内 redeem.js 的 platformReady 不是恒 false'
_sm = _read('src/ui/star-map-frame.html')
assert 'cdnjs.cloudflare.com' not in _sm and 'unpkg.com' not in _sm, '包内星图 CSP 又把 CDN 域名加回来了'
assert "'unsafe-inline'" in _sm and 'blob: data:' in _sm, \
    '包内星图 CSP 收紧过头：6 段内联脚本会被禁、iframe 白屏'
assert not os.path.exists(_AI_TOOL), '包内 ai-player.js 没排干净'
print('包体零外部特征: OK (全文件类型 / 不剥注释 / fetch=0 / 非白名单URL=0 / 自述=0 '
      '/ 平台通道锚点 / CSP 必要指令 / ai-player 已排除 / tap 平台服务 %d 处仅清点)'
      % _tap_net_count)

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
