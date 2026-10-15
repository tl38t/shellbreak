# -*- coding: utf-8 -*-
"""天壳 / SHELLBREAK — 把当前源码设计同步进内容清单 xlsx。

策略（不丢既有手写文案、不破坏既有结构）：
- 读 updated2.xlsx 的每一行，「仍存在于源码」的整行原样保留；
- 源码里已不存在的 ID（如被替换的旧 ERA5 科技）整行删除；
- 源码有、清单缺的实体，按 build.py 同款口径格式化后追加到该表末尾，文案列留空待填；
- 序号重新连续编号。
派生文件另存为 天壳内容清单_待填文案.updated3.xlsx，不动 updated2。
"""
import json, copy
import openpyxl

SRC = r"D:\shellbreak\sim\_content.json"
IN = r"D:\shellbreak\docs\天壳内容清单_待填文案.updated2.xlsx"
OUT = r"D:\shellbreak\docs\天壳内容清单_待填文案.updated3.xlsx"

D = json.load(open(SRC, encoding="utf-8"))
RESS, TECHS, BUILDINGS = D["RESS"], D["TECHS"], D["BUILDINGS"]
JOBS, TOOLS, UPGRADES = D["JOBS"], D["TOOLS"], D["UPGRADES"]
CRAFTS, WONDERS, CIVICS = D["CRAFTS"], D["WONDERS"], D["CIVICS"]
GOVS, POLICIES, ERAS, BRANCHES = D["GOVS"], D["POLICIES"], D["ERAS"], D["BRANCHES"]

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
short_wonder = {}
for wid, wn in wonder_name.items():
    short_wonder[wid.replace("wonder_", "")] = wn

def fmt_cost(c):
    if not c:
        return "—"
    return " + ".join(f"{res_name.get(k, k)} {v}" for k, v in c.items())

def eraname(i):
    return f"{era_name.get(i, i)}（{i}）"

def cond_text(c):
    if not c:
        return "—"
    t = c.get("t", "default"); n = c.get("n")
    if t == "default":
        return "开局即可见"
    if t == "built":
        return f"「{bld_name.get(c.get('b'), c.get('b'))}」累计建成 {n} 级"
    if t == "total":
        return f"建筑总等级达 {n}"
    if t == "res":
        return f"{res_name.get(c.get('r'), c.get('r'))}存量达 {n}"
    if t == "gathered":
        return f"累计采出 {res_name.get(c.get('r'), c.get('r'))} 达 {n}"
    if t == "rate":
        return f"{rate_name.get(c.get('r'), res_name.get(c.get('r'), c.get('r')))}每秒产出达 {n}"
    if t == "pop":
        return f"人口达 {n}"
    if t == "job":
        return f"{job_name.get(c.get('j'), c.get('j'))}达 {n} 人"
    if t == "techs":
        return f"已掌握科技达 {n} 项"
    if t == "eraTechs":
        return f"{eraname(c.get('era'))}已掌握科技达 {n} 项"
    if t == "coef":
        return f"破壳系数达 {n}"
    if t == "tech":
        return f"掌握科技「{tech_name.get(c.get('id'), c.get('id'))}」"
    if t == "upgrade":
        return f"完成升级「{upg_name.get(c.get('id'), c.get('id'))}」"
    if t == "shell":
        return f"破壳达到 {int(round(n*100))}%（壳剩余 ≤ {int(round(n*100))}%）"
    if t == "wonders":
        names = "」与「".join(wonder_name.get(i, short_wonder.get(i, i)) for i in c.get("ids", []))
        return f"建成奇观「{names}」"
    if t == "zoneLvl":
        zn = {"civic": "市政区", "core": "核心区", "academy": "学院区", "civic": "市政区"}.get(c.get("zone"), c.get("zone"))
        return f"{zn}建筑合计等级达 {n}"
    return f"[{t}] {c}"

def tech_eff(eff):
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
            out.append(f"暖石产出 +{int(round(v*100))}%")
        elif k == "titaniumMul":
            out.append(f"钛产出 +{int(round(v*100))}%")
        else:
            out.append(f"[{k}] {v}")
    return "；".join(out)

def wonder_eff(eff):
    if not eff:
        return "—"
    out = []
    for k, v in eff.items():
        if k == "craftRatio":
            out.append(f"工艺制作效率 +{int(round(v*100))}%（加法叠进工坊等级）")
        elif k == "matMax":
            out.append(f"各材料仓储 +{v}")
        elif k == "hydroBonus":
            out.append(f"热液能供给侧 +{v}/秒")
        elif k == "civic":
            out.append(f"市政点 +{v}/秒")
        elif k == "civicSlots":
            out.append(f"额外政策卡槽 ×{v}")
        elif k == "happyConsume":
            out.append(f"幸福度消耗 −{int(round(v*100))}%")
        else:
            out.append(f"[{k}] {v}")
    return "；".join(out) if out else "—"

SLOT_TYPES = {"wild": "万能槽", "prod": "工造槽", "sci": "科研槽", "grow": "民生槽", "relig": "宗教槽"}

def policy_eff(p):
    parts = []
    if "retiredBy" in p:
        parts.append(f"（取代「{civic_name.get(p['retiredBy'], p['retiredBy'])}」）")
    if "happyOffset" in p:
        parts.append(f"幸福度 {p['happyOffset']:+d}")
    if "craftRatio" in p:
        parts.append(f"工坊（工艺制作）效率 +{int(round(p['craftRatio']*100))}%")
    if "storeMul" in p:
        parts.append(f"仓储区建筑容量 ×{p['storeMul']}")
    if "squareMul" in p:
        parts.append(f"广场市政点乘区 ×{p['squareMul']}")
    if "theaterMul" in p:
        parts.append(f"歌剧院官员市政点乘区 ×{p['theaterMul']}")
    if "civicOutMul" in p:
        parts.append(f"市政产出 ×{p['civicOutMul']}（−{int(round((1-p['civicOutMul'])*100))}%）")
    if "sciOutMul" in p:
        parts.append(f"科技产出 ×{p['sciOutMul']}（−{int(round((1-p['sciOutMul'])*100))}%）")
    if "hydroSupplyMul" in p:
        parts.append(f"热液能供给侧 ×{p['hydroSupplyMul']}（+{int(round((p['hydroSupplyMul']-1)*100))}%）")
    if "shellSpeedPerIdle" in p:
        parts.append(f"每点闲置鲛人 +{int(round(p['shellSpeedPerIdle']*100))}% 破壳速度（待天穹钻机机器态实装后生效）")
    base = [x for x in parts if not x.startswith("（取代")]
    retired = [x for x in parts if x.startswith("（取代")]
    return "；".join(base + retired) or "—"

def upgrade_eff(u):
    out = []
    if "invertBuildSave" in u:
        out.append(f"所有建筑造价 −{int(round(u['invertBuildSave']*100))}%")
    if "hydroBuildSave" in u:
        out.append(f"热液汽轮机造价 −{int(round(u['hydroBuildSave']*100))}%")
    if "steelBonus" in u:
        out.append(f"钢产出 +{int(round(u['steelBonus']*100))}%")
    if "ironBonus" in u:
        out.append(f"精铁产出 +{int(round(u['ironBonus']*100))}%")
    return "；".join(out) if out else "—"

# ── 构建新行 ──────────────────────────────────────────────
def bld_cond(b):
    rt = b.get("requiredTech"); rc = b.get("requiredCivic")
    if rt:
        return "需科技「" + "、".join(tech_name.get(t, t) for t in rt) + "」"
    if rc:
        return "需市政「" + civic_name.get(rc, rc) + "」"
    return "开局即可建"

def new_rows(sheet):
    if sheet == "建筑":
        order = [b["id"] for b in BUILDINGS if b["id"] in ("hotforge", "school", "theater", "tenement")]
        rows = []
        for i in order:
            b = next(x for x in BUILDINGS if x["id"] == i)
            rows.append([
                i, b["name"], fmt_cost(b.get("cost")),
                f"{b.get('ratio', 1)}", b.get("desc", ""),
                bld_cond(b), "",
            ])
        return rows
    if sheet == "科技":
        order = [t["id"] for t in TECHS if t["id"] in ("industrialize","pubedu","abyssgeo","highthermo","shellgeo","skydrill")]
        rows = []
        for i in order:
            t = next(x for x in TECHS if x["id"] == i)
            rows.append([
                i, t["name"], eraname(t.get("era")), branch_name.get(t.get("branch"), t.get("branch")),
                t.get("layer", ""), "是" if t.get("key") else "否", "是" if t.get("free") else "否",
                "、".join(tech_name.get(r, r) for r in t.get("reqs", [])) or "—",
                cond_text(t.get("cond")), t.get("cost", 0), tech_eff(t.get("eff")),
                t.get("note", ""), "",
            ])
        return rows
    if sheet == "市政":
        order = [c["id"] for c in CIVICS if c["id"] in ("sharksong","rationing","socialscience","urbanization","mobilization")]
        rows = []
        for i in order:
            c = next(x for x in CIVICS if x["id"] == i)
            rows.append([
                i, c["name"], c.get("cost", 0), eraname(c.get("era")), c.get("layer", ""),
                "、".join(civic_name.get(r, r) for r in c.get("reqs", [])) or "—",
                cond_text(c.get("boost")) if c.get("boost") else "无需鼓舞",
                c.get("desc", ""), c.get("note", ""), "",
            ])
        return rows
    if sheet == "政策":
        order = [p["id"] for p in POLICIES if p["id"] in ("card_rationing","card_political_econ","card_logistics","card_heat_priority","card_mobilization")]
        rows = []
        for i in order:
            p = next(x for x in POLICIES if x["id"] == i)
            typ = p.get("type") or "wild"
            rows.append([
                i, p["name"], civic_name.get(p.get("civic"), p.get("civic")),
                f"{SLOT_TYPES.get(typ, typ)}（{typ}）",
                policy_eff(p), p.get("desc", ""), "",
            ])
        return rows
    if sheet == "奇观":
        order = [w["id"] for w in WONDERS if w["id"] in ("wonder_luluka","wonder_presspipe","wonder_skydrill","wonder_shadow_theater","wonder_congress")]
        rows = []
        for i in order:
            w = next(x for x in WONDERS if x["id"] == i)
            if w.get("need"):
                unlock = f"需科技「{tech_name.get(w['need'], w['need'])}」"
            elif w.get("needCivic"):
                unlock = f"需市政「{civic_name.get(w['needCivic'], w['needCivic'])}」"
            else:
                unlock = "—"
            rows.append([i, w["name"], unlock, fmt_cost(w.get("cost")), wonder_eff(w.get("effect")), w.get("desc", ""), "", ""])
        return rows
    if sheet == "工坊升级":
        order = [u["id"] for u in UPGRADES if u["id"] in ("upg_invertbuild","upg_thermrecover","upg_wasteforge")]
        rows = []
        for i in order:
            u = next(x for x in UPGRADES if x["id"] == i)
            need = u.get("need")
            unlock = f"需科技 {tech_name.get(need, need)}" if need else "—"
            target = u.get("target")
            jobs = "、".join(job_name.get(j, j) for j in target) if target else "—"
            rows.append([i, u["name"], unlock, fmt_cost(u.get("cost")), jobs, upgrade_eff(u), u.get("desc", ""), ""])
        return rows
    if sheet == "工坊制造":
        order = [c["id"] for c in CRAFTS if c["id"] in ("craft_drill",)]
        rows = []
        for i in order:
            c = next(x for x in CRAFTS if x["id"] == i)
            need = c.get("need")
            unlock = f"需科技 {tech_name.get(need, need)}" if need else "建成「工坊」"
            rows.append([i, c["name"], unlock, fmt_cost(c.get("in")),
                         f"{c.get('out', 1)}（每次基准）", c.get("desc", ""),
                         "实际产出 = 基准 ×(1 + 工艺制作效率)；工艺制作效率来自工坊等级与奇观加成", ""])
        return rows
    return []

# ── 主流程 ────────────────────────────────────────────────
wb = openpyxl.load_workbook(IN, data_only=False)
log = []
for ws in wb.worksheets:
    name = ws.title
    ncols = ws.max_column
    ids = [ws.cell(r, 2).value for r in range(2, ws.max_row + 1)]
    # 现有行的 ID 集合（仍存在的才保留）
    src_ids = set()
    if name == "工坊升级":
        src_ids = set(x["id"] for x in TOOLS) | set(x["id"] for x in UPGRADES)
    else:
        key = {"建筑":"BUILDINGS","科技":"TECHS","职业":"JOBS","市政":"CIVICS","政体":"GOVS",
               "政策":"POLICIES","奇观":"WONDERS","工坊制造":"CRAFTS"}[name]
        src_ids = set(x["id"] for x in D[key])
    kept = []
    dropped = []
    for r in range(2, ws.max_row + 1):
        row = [ws.cell(r, c).value for c in range(1, ncols + 1)]
        rid = row[1]
        if rid in src_ids:
            kept.append(row)
        else:
            dropped.append(rid)
    added = new_rows(name)
    # 补齐/裁剪列数
    def norm(row):
        row = list(row)
        if len(row) < ncols:
            row += [""] * (ncols - len(row))
        else:
            row = row[:ncols]
        return row
    kept = [norm(r) for r in kept]
    added = [norm([""] + r) for r in added]
    allrows = kept + added
    for i, row in enumerate(allrows, 1):
        row[0] = i  # 序号连续重排
    # 写回
    for r, row in enumerate(allrows, 2):
        for c, v in enumerate(row, 1):
            ws.cell(r, c).value = v
    # 清掉超出的旧行
    for r in range(len(allrows) + 2, ws.max_row + 1):
        for c in range(1, ncols + 1):
            ws.cell(r, c).value = None
    ws.auto_filter.ref = f"A1:{openpyxl.utils.get_column_letter(ncols)}{len(allrows)+1}"
    if dropped or added:
        log.append(f"[{name}] 保留 {len(kept)} | 删除 {dropped} | 新增 {len(added)}: {[a[1] for a in added]}")

wb.save(OUT)
print("saved:", OUT)
for l in log:
    print(l)
