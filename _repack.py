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
OUT = r'D:/shellbreak/TAPTAP-H5-OUTPUT/shellbreak-taptap-test-rc15.zip'
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

# 科技树节点直接引用这些运行时图片；只同步 tech-icons，避免把本地商店素材等开发文件带进上传包。
tech_icon_src = os.path.join(REPO, 'assets', 'tech-icons')
tech_icon_dst = os.path.join(SRC, 'assets', 'tech-icons')
_sync_tree(tech_icon_src, tech_icon_dst)
print('已自动同步 assets/tech-icons -> 包目录')

# 市政树节点同样直接引用这些运行时图片；只同步 civic-icons，不把本地商店素材等开发文件带进上传包。
civic_icon_src = os.path.join(REPO, 'assets', 'civic-icons')
civic_icon_dst = os.path.join(SRC, 'assets', 'civic-icons')
_sync_tree(civic_icon_src, civic_icon_dst)
print('已自动同步 assets/civic-icons -> 包目录')

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
# 排行榜 6 个 ID 必须已回填（2026-10-10 建 5 个 + 2026-10-13 加星空探索榜 ewv1...）
# ⚠️ 同广告位坑：rank.js 无 ID 时不提交且入口隐藏 ⇒ 空串包 = 榜功能静默消失。
LB_IDS = ('vl1ankteasrn2ba0g3', '2obin1zkh91ss7lyac', 'v6y5wvn3daf1a9i7es',
          'ljn2b6ppris2alrlji', 'dhkg9zq7in4m37vpos', 'ewv1anvdnpxk28ruen',
          '8zfssfmdmc64u27iyx')
missing = [i for i in LB_IDS if i not in body]
assert not missing, f'包内 config.js 的 RANK.LB 缺榜 ID: {missing}，先同步源码'
print('打包前置检查: OK (500000 + cache-buster + 无手动倍速 + 广告按钮 + 壳厚迁移 + 广告位1054324 + dev口收紧 + 排行榜7ID)')

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
