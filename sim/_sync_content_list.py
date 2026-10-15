# -*- coding: utf-8 -*-
"""天壳 / SHELLBREAK — 把当前源码同步进内容清单 xlsx（保留已填文案、修正纪元标签、删除已移除实体）。

策略（低风险、可比对）：
- 读 updated3.xlsx（含 141 条已填文案）作为基底；
- 仍存在于源码的 ID → 整行保留；科技/市政两表的「纪元」列按最新源码重算（修「纪元四」→「洋流纪（4）」等旧标签）；
- 源码已不存在的 ID（如被 redesign 删掉的奇迹/城堡/匠人）→ 整行删除（先记录其文案，避免无声丢失）；
- 源码有、清单缺的实体 → 按口径格式化后追加到该表末尾，文案列留空待填；
- 序号连续重排；
- 另存为 updated4.xlsx，不动 updated3（便于人工比对）。
"""
import json
import openpyxl

SRC = r"D:\shellbreak\sim\_content.json"
IN = r"D:\shellbreak\docs\天壳内容清单_待填文案.updated3.xlsx"
OUT = r"D:\shellbreak\docs\天壳内容清单_待填文案.updated4.xlsx"

D = json.load(open(SRC, encoding="utf-8"))
RESS = D["RESS"]; TECHS = D["TECHS"]; BUILDINGS = D["BUILDINGS"]
JOBS = D["JOBS"]; TOOLS = D["TOOLS"]; UPGRADES = D["UPGRADES"]
CRAFTS = D["CRAFTS"]; WONDERS = D["WONDERS"]; CIVICS = D["CIVICS"]
GOVS = D["GOVS"]; POLICIES = D["POLICIES"]; ERAS = D["ERAS"]; BRANCHES = D["BRANCHES"]

res_name = {k: (RESS.get(k) or {}).get("name", k) for k in RESS}
tech_name = {t["id"]: t["name"] for t in TECHS}
bld_name = {b["id"]: b["name"] for b in BUILDINGS}
wonder_name = {w["id"]: w["name"] for w in WONDERS}
civic_name = {c["id"]: c["name"] for c in CIVICS}
branch_name = {b["id"]: b["name"] for b in BRANCHES}
era_name = {e["id"]: e["name"] for e in ERAS}
upg_name = {u["id"]: u["name"] for u in UPGRADES}
job_name = {j["id"]: j["name"] for j in JOBS}
rate_name = {"hydro": "热液能"}
short_wonder = {wid.replace("wonder_", ""): wn for wid, wn in wonder_name.items()}

def fmt_cost(c):
    if not c:
        return "—"
    return " + ".join(f"{res_name.get(k, k)} {v}" for k, v in c.items())

def eraname(i):
    return f"{era_name.get(i, i)}（{i}）"

def eff_text(eff):
    if not eff:
        return "—"
    out = []
    MUL = {"gather": "采集产出", "food": "藻食产出", "sci": "科技产出", "craft": "加工产出",
           "fuel": "地热产出", "smelt": "精铁产出", "miracle": "祭坛削壳",
           "farm": "采集者转农民后的产出"}
    ADD = {"warm": "抗寒上限", "coef": "破壳系数", "house": "住房", "kelpCap": "藻食上限"}
    for k, v in eff.items():
        if k in MUL:
            out.append(f"{MUL[k]} ×{v}")
        elif k in ADD:
            out.append(f"{ADD[k]} +{v}")
        elif k in res_name:
            out.append(f"{res_name[k]} +{v}/秒")
        elif k == "season":
            out.append(f"季节减产减 {v}")
        elif k == "unlockBuild":
            out.append("解锁建筑：" + "、".join(bld_name.get(x, x) for x in v))
        elif k == "unlockJob":
            out.append("解锁职业：" + "、".join(job_name.get(x, x) for x in v))
        elif k == "warmMul":
            out.append(f"暖石产出 +{int(round(v * 100))}%")
        elif k == "titaniumMul":
            out.append(f"钛产出 +{int(round(v * 100))}%")
        else:
            out.append(f"[{k}] {v}")
    return "；".join(out)

def cond_text(c):
    if not c:
        return "—"
    t = c.get("t", "default"); n = c.get("n")
    if t == "default": return "开局即可见"
    if t == "built": return f"「{bld_name.get(c.get('b'), c.get('b'))}」累计建成 {n} 级"
    if t == "total": return f"建筑总等级达 {n}"
    if t == "res": return f"{res_name.get(c.get('r'), c.get('r'))}存量达 {n}"
    if t == "gathered": return f"累计采出 {res_name.get(c.get('r'), c.get('r'))} 达 {n}"
    if t == "rate": return f"{rate_name.get(c.get('r'), res_name.get(c.get('r'), c.get('r')))}每秒产出达 {n}"
    if t == "pop": return f"人口达 {n}"
    if t == "job": return f"{job_name.get(c.get('j'), c.get('j'))}达 {n} 人"
    if t == "techs": return f"已掌握科技达 {n} 项"
    if t == "eraTechs": return f"{eraname(c.get('era'))}已掌握科技达 {n} 项"
    if t == "coef": return f"破壳系数达 {n}"
    if t == "tech": return f"掌握科技「{tech_name.get(c.get('id'), c.get('id'))}」"
    if t == "upgrade": return f"完成升级「{upg_name.get(c.get('id'), c.get('id'))}」"
    if t == "shell": return f"破壳达到 {int(round(n*100))}%（壳剩余 ≤ {int(round(n*100))}%）"
    if t == "wonders":
        names = "」与「".join(wonder_name.get(i, short_wonder.get(i, i)) for i in c.get("ids", []))
        return f"建成奇观「{names}」"
    if t == "zoneLvl":
        zn = {"civic": "市政区", "core": "核心区", "academy": "学院区"}.get(c.get("zone"), c.get("zone"))
        return f"{zn}建筑合计等级达 {n}"
    return f"[{t}] {c}"

def wonder_eff(eff):
    if not eff:
        return "—"
    out = []
    for k, v in eff.items():
        if k == "craftRatio": out.append(f"工艺制作效率 +{int(round(v*100))}%（加法叠进工坊等级）")
        elif k == "matMax": out.append(f"各材料仓储 +{v}")
        elif k == "hydroBonus": out.append(f"热液能供给侧 +{v}/秒")
        elif k == "civic": out.append(f"市政点 +{v}/秒")
        elif k == "civicSlots": out.append(f"额外政策卡槽 ×{v}")
        elif k == "happyConsume": out.append(f"幸福度消耗 −{int(round(v*100))}%")
        else: out.append(f"[{k}] {v}")
    return "；".join(out) if out else "—"

SLOT_TYPES = {"wild": "万能槽", "prod": "工造槽", "sci": "科研槽", "grow": "民生槽", "relig": "宗教槽"}

def policy_eff(p):
    parts = []
    if "retiredBy" in p: parts.append(f"（取代「{civic_name.get(p['retiredBy'], p['retiredBy'])}」）")
    if "happyOffset" in p: parts.append(f"幸福度 {p['happyOffset']:+d}")
    if "craftRatio" in p: parts.append(f"工坊（工艺制作）效率 +{int(round(p['craftRatio']*100))}%")
    if "storeMul" in p: parts.append(f"仓储区建筑容量 ×{p['storeMul']}")
    if "squareMul" in p: parts.append(f"广场市政点乘区 ×{p['squareMul']}")
    if "theaterMul" in p: parts.append(f"歌剧院官员市政点乘区 ×{p['theaterMul']}")
    if "civicOutMul" in p: parts.append(f"市政产出 ×{p['civicOutMul']}（−{int(round((1-p['civicOutMul'])*100))}%）")
    if "sciOutMul" in p: parts.append(f"科技产出 ×{p['sciOutMul']}（−{int(round((1-p['sciOutMul'])*100))}%）")
    if "hydroSupplyMul" in p: parts.append(f"热液能供给侧 ×{p['hydroSupplyMul']}（+{int(round((p['hydroSupplyMul']-1)*100))}%）")
    if "shellSpeedPerIdle" in p: parts.append(f"每点闲置鲛人 +{int(round(p['shellSpeedPerIdle']*100))}% 破壳速度（待天穹钻机机器态实装后生效）")
    base = [x for x in parts if not x.startswith("（取代")]
    retired = [x for x in parts if x.startswith("（取代")]
    return "；".join(base + retired) or "—"

def upgrade_eff(u):
    out = []
    if "invertBuildSave" in u: out.append(f"所有建筑造价 −{int(round(u['invertBuildSave']*100))}%")
    if "hydroBuildSave" in u: out.append(f"热液汽轮机造价 −{int(round(u['hydroBuildSave']*100))}%")
    if "steelBonus" in u: out.append(f"钢产出 +{int(round(u['steelBonus']*100))}%")
    if "ironBonus" in u: out.append(f"精铁产出 +{int(round(u['ironBonus']*100))}%")
    return "；".join(out) if out else "—"

def bld_cond(b):
    rt = b.get("requiredTech"); rc = b.get("requiredCivic")
    if rt: return "需科技「" + "、".join(tech_name.get(t, t) for t in rt) + "」"
    if rc: return "需市政「" + civic_name.get(rc, rc) + "」"
    return "开局即可建"

# 表 → 源码实体列表（工坊升级 = TOOLS + UPGRADES 合并）
SHEET_SRC = {
    "建筑": BUILDINGS, "科技": TECHS, "职业": JOBS, "市政": CIVICS, "政体": GOVS,
    "政策": POLICIES, "奇观": WONDERS, "工坊升级": TOOLS + UPGRADES, "工坊制造": CRAFTS,
}
ERA_SHEETS = {"科技", "市政"}  # 这两表有「纪元」列需要修正

def fmt_entity(sheet, ent):
    """返回不含「序号」的数据列（与 updated3 各表列结构对齐）。"""
    if sheet == "建筑":
        cost = ent.get("cost") or {}
        return [ent["id"], ent["name"], fmt_cost(cost), f"{ent.get('ratio', 1)}",
                ent.get("desc", ""), bld_cond(ent), ""]
    if sheet == "科技":
        return [ent["id"], ent["name"], eraname(ent.get("era")), branch_name.get(ent.get("branch"), ent.get("branch")),
                ent.get("layer", ""), "是" if ent.get("key") else "否", "是" if ent.get("free") else "否",
                "、".join(tech_name.get(r, r) for r in ent.get("reqs", [])) or "—",
                cond_text(ent.get("cond")), ent.get("cost", 0), eff_text(ent.get("eff")),
                ent.get("note", ""), ""]
    if sheet == "职业":
        unlocked = [t["name"] for t in TECHS if ent["id"] in ((t.get("eff") or {}).get("unlockJob", []))]
        return [ent["id"], ent["name"], ent.get("desc", ""), "、".join(unlocked) or "—", ""]
    if sheet == "市政":
        gov = ""
        for g in GOVS:
            if g["id"] == ent.get("gov"): gov = g["name"]
        return [ent["id"], ent["name"], ent.get("cost", 0), eraname(ent.get("era")), ent.get("layer", ""),
                "、".join(civic_name.get(r, r) for r in (ent.get("reqs") or [])) or "—",
                cond_text(ent.get("boost")) if ent.get("boost") else "无需鼓舞",
                (ent.get("desc", "") + (f"｜解锁政体：{gov}" if gov and gov not in ent.get("desc", "") else "")).strip(),
                ent.get("note", ""), ""]
    if sheet == "政体":
        from_c = ""
        for c in CIVICS:
            if c.get("gov") == ent["id"]: from_c = c["name"]; break
        slots = ent.get("slots") or {}
        stxt = "、".join(f"{SLOT_TYPES.get(k, k)} ×{v}" for k, v in slots.items()) or "—"
        return [ent["id"], ent["name"], stxt, eff_text(ent.get("effect")),
                f"完成市政「{from_c}」后自动采用" if from_c else "—", ent.get("desc", ""), ent.get("note", ""), ""]
    if sheet == "政策":
        typ = ent.get("type") or "wild"
        return [ent["id"], ent["name"], civic_name.get(ent.get("civic"), ent.get("civic")),
                f"{SLOT_TYPES.get(typ, typ)}（{typ}）", policy_eff(ent), ent.get("desc", ""), ""]
    if sheet == "奇观":
        if ent.get("need"): unlock = f"需科技「{tech_name.get(ent['need'], ent['need'])}」"
        elif ent.get("needCivic"): unlock = f"需市政「{civic_name.get(ent['needCivic'], ent['needCivic'])}」"
        else: unlock = "—"
        return [ent["id"], ent["name"], unlock, fmt_cost(ent.get("cost")), wonder_eff(ent.get("effect")),
                ent.get("desc", ""), "", ""]
    if sheet == "工坊升级":
        need = ent.get("need")
        unlock = f"需科技 {tech_name.get(need, need)}" if need else "—"
        target = ent.get("target")
        jobs = "、".join(job_name.get(j, j) for j in target) if target else "—"
        return [ent["id"], ent["name"], unlock, fmt_cost(ent.get("cost")), jobs, upgrade_eff(ent), ent.get("desc", ""), ""]
    if sheet == "工坊制造":
        need = ent.get("need")
        unlock = f"需科技 {tech_name.get(need, need)}" if need else "建成「工坊」"
        return [ent["id"], ent["name"], unlock, fmt_cost(ent.get("in")),
                f"{ent.get('out', 1)}（每次基准）", ent.get("desc", ""),
                "实际产出 = 基准 ×(1 + 工艺制作效率)；工艺制作效率来自工坊等级与奇观加成", ""]
    return []

wb = openpyxl.load_workbook(IN, data_only=False)
log = []
for ws in wb.worksheets:
    name = ws.title
    ncols = ws.max_column
    hdr = {ws.cell(1, c).value: c for c in range(1, ncols + 1)}
    src_list = SHEET_SRC[name]
    src_ids = set(x["id"] for x in src_list)
    src_era = {x["id"]: x.get("era") for x in src_list} if name in ERA_SHEETS else {}
    txt_col = hdr.get("文案")
    era_col = hdr.get("纪元") if name in ERA_SHEETS else None

    kept, dropped = [], []
    for r in range(2, ws.max_row + 1):
        row = [ws.cell(r, c).value for c in range(1, ncols + 1)]
        rid = row[1]
        if rid in src_ids:
            # 修正纪元列（按最新源码），其余整行原样保留（含已填文案）
            if era_col is not None and src_era.get(rid) is not None:
                row[era_col - 1] = eraname(src_era[rid])
            kept.append(row)
        else:
            dropped.append((rid, ws.cell(r, hdr.get("名称", 2)).value,
                            ws.cell(r, txt_col).value if txt_col else None))
    kept_ids = set(r[1] for r in kept)
    added = []
    for ent in src_list:
        if ent["id"] not in kept_ids:
            new = [""] + fmt_entity(name, ent)  # 前置空序号
            added.append(new)
    allrows = kept + added

    def norm(row):
        row = list(row)
        if len(row) < ncols: row += [""] * (ncols - len(row))
        else: row = row[:ncols]
        return row
    allrows = [norm(r) for r in allrows]
    for i, row in enumerate(allrows, 1):
        row[0] = i
    for r, row in enumerate(allrows, 2):
        for c, v in enumerate(row, 1):
            ws.cell(r, c).value = v
    # 真正删除被剔除实体遗留的空尾行（避免 max_row 虚高）
    if ws.max_row > len(allrows) + 1:
        ws.delete_rows(len(allrows) + 2, ws.max_row - len(allrows) - 1)
    ws.auto_filter.ref = f"A1:{openpyxl.utils.get_column_letter(ncols)}{len(allrows) + 1}"
    if dropped or added:
        d_info = [f"{rid}({nm})" + (f" 文案={str(t)[:24]}" if t else " 文案=空") for rid, nm, t in dropped]
        log.append(f"[{name}] 保留 {len(kept)} | 删除 {d_info} | 新增 {[a[1] for a in added]}")

wb.save(OUT)
print("saved:", OUT)
for l in log:
    print(l)
