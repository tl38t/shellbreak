"""Export runtime locale bundles from the single authoritative text registry.

The registry (i18n_text_inventory.xlsx) is the only input. Proofread conclusions
have been merged back into it by registration ID, so no second workbook is read
here and no file that exists only on one developer's machine is required.

Usage:
    python scripts/export_i18n_runtime.py            # regenerate bundles
    python scripts/export_i18n_runtime.py --check   # verify bundles are up to date

Only rows whose English status is 已校对 are exported to en-US. Rows marked
待校对 (or any status without approved English) still export their zh-CN source,
but no English value: at runtime SB.i18n.valueFor() falls back to zh-CN. This
is deliberate -- an unreviewed translation must never be silently shipped.
"""

from __future__ import annotations

import argparse
import json
import posixpath
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / "outputs/01a1a5d6-2784-7eb0-9310-cc0f0d8bb4b9/i18n_text_inventory.xlsx"
ZH_OUT = ROOT / "src/locales/zh-CN.js"
EN_OUT = ROOT / "electron/locales/en-US.js"
SHEET_NAME = "文案底表"
NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$")
COLUMNS = {
    "id": "登记编号",
    "key": "最终 i18n key",
    "zh": "简体中文基准（zh-CN）",
    "en": "English (en-US)",
    "status": "英文状态",
}


def _column_number(cell_ref: str) -> int:
    letters = re.match(r"[A-Z]+", cell_ref)
    if not letters:
        raise ValueError(f"Unexpected cell reference: {cell_ref}")
    result = 0
    for letter in letters.group(0):
        result = result * 26 + ord(letter) - ord("A") + 1
    return result


def read_registry(path: Path) -> list[dict[str, str | None]]:
    """Read one sheet from an xlsx without third-party dependencies."""
    with zipfile.ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {
            node.attrib["Id"]: node.attrib["Target"].lstrip("/")
            for node in rels
        }
        sheet = next(
            node for node in workbook.find("m:sheets", NS)
            if node.attrib["name"] == SHEET_NAME
        )
        target = targets[sheet.attrib[f"{{{NS['r']}}}id"]]
        sheet_path = target if target.startswith("xl/") else posixpath.normpath(posixpath.join("xl", target))
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared_strings = [
                "".join(node.text or "" for node in item.findall(".//m:t", NS))
                for item in shared_root.findall("m:si", NS)
            ]
        root = ET.fromstring(archive.read(sheet_path))

    raw_rows: list[list[str | None]] = []
    for row in root.findall(".//m:sheetData/m:row", NS):
        cells: dict[int, str | None] = {}
        for cell in row.findall("m:c", NS):
            ref = cell.attrib.get("r", "")
            kind = cell.attrib.get("t")
            value_node = cell.find("m:v", NS)
            value = value_node.text if value_node is not None else None
            if kind == "s" and value is not None:
                value = shared_strings[int(value)]
            elif kind == "inlineStr":
                value = "".join(node.text or "" for node in cell.findall(".//m:t", NS))
            cells[_column_number(ref)] = value
        raw_rows.append([cells.get(index) for index in range(1, 18)])

    if not raw_rows:
        raise ValueError(f"No rows found in {path}")
    headers = raw_rows[0]
    return [dict(zip(headers, row)) for row in raw_rows[1:]]  # type: ignore[arg-type]


def locale_rows(inventory: list[dict]) -> dict[str, tuple[str, str | None]]:
    """Resolve every registered semantic key to (zh-CN, en-US | None)."""
    entries: dict[str, tuple[str, str | None]] = {}
    for row in inventory:
        status = row.get(COLUMNS["status"])
        if status not in {"已校对", "待校对"}:
            continue
        key = row.get(COLUMNS["key"])
        zh = row.get(COLUMNS["zh"])
        if not isinstance(key, str) or not key or key == "待迁移":
            continue
        if not KEY_PATTERN.fullmatch(key):
            raise ValueError(f"Invalid semantic key {key!r} on {row.get(COLUMNS['id'])}")
        if not isinstance(zh, str) or not zh:
            raise ValueError(f"Missing zh-CN source for {key}")

        # Only reviewed English is allowed into the en-US bundle. Unreviewed
        # strings stay Chinese at runtime via SB.i18n's zh-CN fallback.
        candidate = row.get(COLUMNS["en"])
        english = candidate if status == "已校对" and isinstance(candidate, str) and candidate else None

        previous = entries.get(key)
        if previous is not None:
            if previous[0] != zh:
                raise ValueError(f"Conflicting zh-CN values for {key}: {previous[0]!r} vs {zh!r}")
            if previous[1] and english and previous[1] != english:
                raise ValueError(f"Conflicting en-US values for {key}: {previous[1]!r} vs {english!r}")
            if previous[1] and not english:
                english = previous[1]
        entries[key] = (zh, english)
    return entries


def render_js(locale: str, values: dict[str, str]) -> str:
    payload = json.dumps(values, ensure_ascii=False, indent=2, sort_keys=True)
    return (
        "'use strict';\n\n"
        "window.ShellbreakLocales = window.ShellbreakLocales || Object.create(null);\n"
        f"window.ShellbreakLocales[{json.dumps(locale)}] = Object.freeze({payload});\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if the generated bundles differ from the files on disk",
    )
    args = parser.parse_args()

    inventory = read_registry(INVENTORY)
    entries = locale_rows(inventory)
    if not entries:
        raise ValueError("No keyed text was found for the approved Chinese baseline")

    bundles = {
        ZH_OUT: render_js("zh-CN", {key: value[0] for key, value in entries.items()}),
        EN_OUT: render_js("en-US", {key: value[1] for key, value in entries.items() if value[1]}),
    }

    if args.check:
        stale = []
        for path, expected in bundles.items():
            actual = path.read_text(encoding="utf-8") if path.exists() else None
            if actual != expected:
                stale.append(str(path.relative_to(ROOT)))
        if stale:
            print("STALE locale bundles: " + ", ".join(stale), file=sys.stderr)
            return 1
        print("Locale bundles are up to date (regeneration produces no diff).")
        return 0

    for path, content in bundles.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="\n")
    zh_count = len(entries)
    en_count = sum(1 for value in entries.values() if value[1])
    print(f"Exported {zh_count} zh-CN keys and {en_count} approved en-US keys from {len(inventory)} registry rows")
    print(f"  source: {INVENTORY.relative_to(ROOT)}")
    print(f"  zh-CN: {ZH_OUT.relative_to(ROOT)}")
    print(f"  en-US: {EN_OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
