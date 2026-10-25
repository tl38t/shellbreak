# -*- coding: utf-8 -*-
"""天壳 SHELLBREAK — 全量文本本地化基线 / 泄漏扫描工作簿。

输入：sim/_i18n_texts.json（由 sim/_i18n_extract.mjs 从真实源码抽取）
输出：docs/天壳全量文本_本地化基线.xlsx  +  同名 .csv（UTF-8 BOM，供翻译工作流）

两件事：
  ① 宽表：一行一条文本，带本地化键 / 类目 / 实体 / 字段 / 可见性 / 位置，en 列留空待译。
  ② 泄漏扫描：用开发黑话词表扫「玩家可见」文本，把「设计语言漏给玩家」挑出来人工复核。
"""
import csv
import json
import os
import re
from collections import Counter

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = r"D:\shellbreak"
SRC = os.path.join(ROOT, "sim", "_i18n_texts.json")
OUT_XLSX = os.environ.get("SB_I18N_XLSX") or os.path.join(ROOT, "docs", "天壳全量文本_本地化基线.xlsx")
OUT_CSV = os.environ.get("SB_I18N_CSV") or os.path.join(ROOT, "docs", "天壳全量文本_本地化基线.csv")

D = json.load(open(SRC, encoding="utf-8"))
ROWS = D["rows"]

# ── 泄漏词表 ──────────────────────────────────────────────────
# A 级：几乎只可能是开发语言（出现即需复核）
PAT_A = [
    "实装", "接线", "挂起", "预留", "标定", "提议值", "口径", "落地", "兜底", "硬编码",
    "写死", "埋点", "占位", "TODO", "FIXME", "批注", "策划", "源码", "字段", "变量",
    "老存档", "存档迁移", "回归", "探针", "沙箱", "调试", "DEBUG", "待补", "待定", "待拍",
    "待确认", "待填", "缺文案", "空着", "暂缺", "已删", "手改", "尚未设计", "尚未实装",
    "二期", "三期", "后续版本", "待后续", "玩家提示", "提醒玩家", "需要提示", "内部",
    "未启用", "暂未开放", "暂未实现", "未实现", "后续开放",
]
# B 级：也可能是世界观/玩法正常用词（开关/通道/系数/版本/日志…），命中只作提醒，需人工判。
# ⚠️「暂不」「未定」已从 A 级移出：「暂不可研究」「广告暂不可用」「尚未定形的宇宙」是合法玩家文案。
PAT_B = [
    "通道", "开关", "系数", "版本", "日志", "迁移", "暂", "数值", "参数", "逻辑", "代码",
    "模块", "兼容", "旧版", "新版", "状态机", "接口", "上限值",
]
VISIBLE_FIELDS = {"name", "desc", "flavor", "effectDesc", "unlockDesc", "tip", "hint", "label",
                  "outLabel", "title", "subtitle", "motto", "short", "text", "msg", "quote",
                  "story", "brief", "unit", "HTML文本片段", "attr", "text"}
SCAN_SURFACES = {"玩家可见", "待判定", "结构(含标签,见子行)"}
SKIP_SURFACES = {"内部批注", "内部(AI)", "内部(控制台)"}

# ── 已确认保留白名单（用户拍板过，重扫不再报） ────────────────
# 2026-10-24 用户逐条裁定：严冬计划「确实还没做，先不管」；存档两条错误提示「不动」。
# workshop.js 那条是休眠死门（当前没有任何工具带 wip:true），也不会真的显示给玩家。
SUPPRESS = {
    "暂时占位（流浪泰拉挑战相关机制随后设计）": "已确认保留：严冬计划机制确实未做（用户 2026-10-24「先不管」）",
    "本周目存档缺少必要字段": "已确认保留：面向玩家的存档错误提示（用户 2026-10-24「不动」）",
    "本周目存档迁移结果无效": "已确认保留：面向玩家的存档错误提示（用户 2026-10-24「不动」）",
    "尚未设计（效果待定）": "休眠门：当前无任何工具带 wip:true，玩家看不到",
}


def risk_of(r):
    """返回 (等级, 命中词串)。只扫玩家可见文本；note 等内部字段不扫（那本来就不给玩家看）。"""
    if r["surface"] in SKIP_SURFACES:
        return "", ""
    if r["surface"] not in SCAN_SURFACES:
        return "", ""
    if r["scope"] == "数据表" and r["field"] not in VISIBLE_FIELDS:
        return "", ""
    zh = r["zh"]
    hits_a = [w for w in PAT_A if w in zh]
    if hits_a:
        return "A", "、".join(hits_a)
    hits_b = [w for w in PAT_B if w in zh]
    if hits_b:
        return "B", "、".join(hits_b)
    return "", ""


# ── 合并：字面量与数据表同文 → 并进数据表那一行（同一句只需译一次） ──
by_zh = {}
for r in ROWS:
    by_zh.setdefault(r["zh"], []).append(r)

merged = []
dropped = 0
for r in ROWS:
    if r["scope"] == "数据表":
        r.setdefault("refs", [])
        merged.append(r)
        continue
    cands = by_zh.get(r["zh"], [])
    parent = None
    for c in cands:
        if c["scope"] == "数据表" and (not r.get("entityId") or not c.get("entityId") or c["entityId"] == r["entityId"]):
            parent = c
            break
    if parent is not None and r.get("file"):
        loc = f"{r['file']}:{r['line']}"
        if loc not in parent.setdefault("refs", []):
            parent["refs"].append(loc)
        dropped += 1
        continue
    merged.append(r)

for r in merged:
    lvl, hit = risk_of(r)
    r["risk"], r["risk_hit"], r["note"] = lvl, hit, ""
    for k, why in SUPPRESS.items():          # 已拍板保留的，从嫌疑里摘出去并留理由
        if k in r["zh"]:
            r["risk"], r["risk_hit"], r["note"] = "", "", why
            break

# 同文出现次数（译者可按此去重）
zh_count = Counter(r["zh"] for r in merged)

HDRS = ["序号", "本地化键 key", "来源", "类目", "实体ID", "实体名", "字段", "中文原文",
        "English（待译）", "备注", "可见性", "泄漏嫌疑", "风险级", "位置", "标记"]
WIDTHS = [5, 30, 10, 12, 18, 12, 12, 60, 40, 14, 14, 16, 6, 34, 22]


def row_of(i, r):
    loc = "；".join(r.get("refs", [])) or (f"{r['file']}:{r['line']}" if r.get("file") else f"表 {r['table']}")
    return [
        i, r["key"], r["scope"], r.get("tableCn", r.get("table", "")), r.get("entityId", ""),
        r.get("entityName", ""), r["field"], r["zh"], "", r.get("note", ""), r["surface"],
        r.get("risk_hit", ""), r.get("risk", ""), loc, r.get("flags", ""),
    ]


rows_out = [row_of(i, r) for i, r in enumerate(merged, 1)]
risk_rows = [r_ for r_ in rows_out if r_[12]]

# ── 样式 ──────────────────────────────────────────────────────
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
HDR_FILL = PatternFill("solid", fgColor="F2F2F2")
HDR_FONT = Font(bold=True, color="1A1A1A", size=10)
BODY = Font(size=10)
TXT = Alignment(horizontal="left", vertical="top", wrap_text=True)
CTR = Alignment(horizontal="center", vertical="top", wrap_text=True)
EN_FILL = PatternFill("solid", fgColor="FFF2CC")     # 待译列
RISK_A = PatternFill("solid", fgColor="FFC7CE")
RISK_B = PatternFill("solid", fgColor="FFEB9C")

wb = Workbook()
wb.properties.title = "天壳 SHELLBREAK 全量文本（本地化基线 / 泄漏扫描）"
wb.remove(wb.active)


def sheet(name, headers, rows, widths, center_cols=()):
    ws = wb.create_sheet(name)
    ws.sheet_properties.tabColor = "BFBFBF"
    for c, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=c, value=h)
        cell.fill, cell.font, cell.alignment, cell.border = HDR_FILL, HDR_FONT, CTR, BORDER
    for i, row in enumerate(rows, start=2):
        for c, v in enumerate(row, 1):
            cell = ws.cell(row=i, column=c, value=v)
            cell.font, cell.border = BODY, BORDER
            cell.alignment = CTR if c in center_cols else TXT
            if c == 9:
                cell.fill = EN_FILL
        if row[12] == "A":
            for c in (11, 12, 13):
                ws.cell(row=i, column=c).fill = RISK_A
        elif row[12] == "B":
            for c in (11, 12, 13):
                ws.cell(row=i, column=c).fill = RISK_B
    for c, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(c)].width = w
    ws.freeze_panes = "C2"
    if rows:
        ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{len(rows) + 1}"
    return ws


# ── 说明 ──────────────────────────────────────────────────────
ws = wb.create_sheet("说明")
ws.sheet_properties.tabColor = "BFBFBF"
LINES = [
    ("天壳 SHELLBREAK — 全量文本 · 本地化基线 / 泄漏扫描", True),
    ("", False),
    (f"生成时间：{D['generated']}　抽取行数：{D['count']}　合并同文后：{len(merged)}　待复核嫌疑：{len(risk_rows)}", False),
    ("数据源：src/** 全部 .js + index.html + src/ui/*.html，由 sim/_i18n_extract.mjs 真实加载 + 剥注释后字符级扫描。", False),
    ("", False),
    ("一、这张表怎么用", True),
    ("① 本地化：填「English（待译）」列。一行一条文本，key 列即主键；同文只出现一次（字面量已并进数据表行）。", False),
    ("② 查泄漏：看「泄漏嫌疑 / 风险级」列，或直接翻「泄漏嫌疑」页。A 级=几乎必是开发语言，B 级=可能是世界观正常用词，需人工判。", False),
    ("③ 分工：按「类目」列筛（科技/市政/政策卡/奇观…），或按「可见性」列筛。", False),
    ("", False),
    ("二、列口径", True),
    ("来源：数据表（SB 上 20 张内容表，按字段取）/ 代码字面量（渲染层写死的 UI 文案）/ HTML文本 / HTML属性。", False),
    ("可见性：玩家可见（默认要译）/ 待判定（玩法逻辑里的串，可能是 toast 或日志）/ 内部批注（note 字段，源码内部批注，不译不显示）/ 内部(AI) / 内部(控制台) / 结构(含标签,见子行)（原文是 HTML 片段，已拆出子行）。", False),
    ("字段：name/desc/flavor=名称/说明/风味文本；note=源码内部批注（按项目纪律不算文案）；HTML文本片段=从含标签原串里拆出的可译文本。", False),
    ("位置：数据表行显示「表 XXX」；渲染层行显示 file:line；同句在多个位置出现会并列。", False),
    ("标记：含HTML标签 / 含插值占位符 / 拼接片段（句子被 + 拆成多段，需合并后再译）/ HTML片段。", False),
    ("", False),
    ("三、已知边界（别当 bug）", True),
    ("① UI 字面量的 key 带行号（ui.文件名.行号），代码一移动就漂 —— 真正做 i18n 时要把这些串提成语义键（如 ui.folk.idleHint），行号 key 只用于当下定位。", False),
    ("② 「拼接片段」的中文句子被 + 拆开，单看一行不成句，翻译前需按位置把相邻几行拼起来。", False),
    ("③ 玩法逻辑层的「待判定」串里混着 toast、弹窗文案与内部日志，需按位置确认是否给玩家看。", False),
    ("④ 本表不含 CSS 里的 content、不含图片上的美术字（那些要另做美术资源表）。", False),
]
for i, (t, bold) in enumerate(LINES, 1):
    c = ws.cell(row=i, column=1, value=t)
    c.font = Font(size=10, bold=bold)
    c.alignment = Alignment(horizontal="left", vertical="top", wrap_text=False)
ws.column_dimensions["A"].width = 150

# ── 统计 ──────────────────────────────────────────────────────
ws = wb.create_sheet("统计")
ws.sheet_properties.tabColor = "BFBFBF"
stat = [["类目", "字段", "条数"]]
cnt = Counter((r.get("tableCn", ""), r["field"]) for r in merged)
for (t, f), n in sorted(cnt.items(), key=lambda x: (-x[1], x[0][0])):
    stat.append([t, f, n])
surf = Counter(r["surface"] for r in merged)
stat.append(["", "", ""])
stat.append(["— 按可见性 —", "", ""])
for k, v in surf.most_common():
    stat.append([k, "", v])
for i, row in enumerate(stat, 1):
    for c, v in enumerate(row, 1):
        cell = ws.cell(row=i, column=c, value=v)
        cell.font = HDR_FONT if i == 1 else BODY
        cell.border = BORDER
        cell.alignment = CTR if c == 3 else TXT
        if i == 1:
            cell.fill = HDR_FILL
ws.column_dimensions["A"].width = 22
ws.column_dimensions["B"].width = 18
ws.column_dimensions["C"].width = 8

# ── 泄漏嫌疑 / 总表 ───────────────────────────────────────────
risk_rows.sort(key=lambda r: (r[12] != "A", r[3], r[1]))
sheet("泄漏嫌疑", HDRS, risk_rows, WIDTHS, center_cols=(1, 3, 7, 11, 13))
sheet("总表", HDRS, rows_out, WIDTHS, center_cols=(1, 3, 7, 11, 13))

os.makedirs(os.path.dirname(OUT_XLSX), exist_ok=True)
wb.save(OUT_XLSX)

with open(OUT_CSV, "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(HDRS)
    w.writerows(rows_out)

print("xlsx:", OUT_XLSX)
print("csv :", OUT_CSV)
print("rows:", len(merged), "| 合并掉的同文字面量:", dropped, "| 嫌疑行:", len(risk_rows))
print("A级:", sum(1 for r in risk_rows if r[12] == "A"), "B级:", sum(1 for r in risk_rows if r[12] == "B"))
for r in risk_rows:
    if r[12] == "A":
        print(f"  [A] {r[3]}/{r[5] or r[4]} · {r[6]:<10} · {r[11]:<12} · {r[7][:70]}")
