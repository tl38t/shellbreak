"""Export runtime locale bundles from the single authoritative text registry.

The registry (i18n_text_inventory.xlsx) is the only input. Proofread conclusions
have been merged back into it by registration ID, so no second workbook is read
here and no file that exists only on one developer's machine is required.

Usage:
    python scripts/export_i18n_runtime.py            # regenerate bundles
    python scripts/export_i18n_runtime.py --check   # verify bundles are up to date

Only translations marked 已校对 are exported. Missing or unreviewed translations
fall back to zh-CN at runtime. Use --require-complete as a release gate: it
fails when any active semantic key lacks an approved translation in a selected
runtime locale.
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
TC_OUT = ROOT / "electron/locales/zh-TW.js"
SHEET_NAME = "文案底表"
NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
KEY_PATTERN = re.compile(r"^[a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*$")
ACTIVE_TEXT_STATUSES = {"已校对", "待校对", "草稿", "待翻译"}
SOURCE_KEY_CALL_PATTERNS = (
    re.compile(
        r"\b(?:SB\.i18n\.t|tr|text|gameText|achvText|challengeTr|translate)"
        r"\s*\(\s*['\"]([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)['\"]"
    ),
    re.compile(
        r"\bdata-i18n(?:-[a-z-]+)?\s*=\s*['\"]"
        r"([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)['\"]"
    ),
)
COLUMNS = {
    "id": "登记编号",
    "key": "最终 i18n key",
    "zh": "简体中文基准（zh-CN）",
    "en": "English (en-US)",
    "status": "英文状态",
    "tc": "繁體中文（zh-TW，游戏内）",
    "tc_status": "繁中（游戏内）状态",
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
        width = max(cells, default=0)
        raw_rows.append([cells.get(index) for index in range(1, width + 1)])

    if not raw_rows:
        raise ValueError(f"No rows found in {path}")
    headers = raw_rows[0]
    return [dict(zip(headers, row)) for row in raw_rows[1:]]  # type: ignore[arg-type]


def locale_rows(inventory: list[dict]) -> dict[str, tuple[str, str | None, str | None]]:
    """Resolve active semantic keys to (zh-CN, en-US | None, zh-TW | None)."""
    entries: dict[str, tuple[str, str | None, str | None]] = {}
    for row in inventory:
        status = row.get(COLUMNS["status"])
        if status not in ACTIVE_TEXT_STATUSES:
            continue
        key = row.get(COLUMNS["key"])
        zh = row.get(COLUMNS["zh"])
        if not isinstance(key, str) or not key or key == "待迁移":
            continue
        if key.startswith("store.steam."):
            continue
        if not KEY_PATTERN.fullmatch(key):
            raise ValueError(f"Invalid semantic key {key!r} on {row.get(COLUMNS['id'])}")
        if not isinstance(zh, str) or not zh:
            raise ValueError(f"Missing zh-CN source for {key}")

        # Only reviewed English is allowed into the en-US bundle. All rows
        # with live source text still contribute their zh-CN baseline.
        candidate = row.get(COLUMNS["en"])
        english = candidate if status == "已校对" and isinstance(candidate, str) and candidate else None
        traditional_candidate = row.get(COLUMNS["tc"])
        traditional_status = row.get(COLUMNS["tc_status"])
        traditional = (
            traditional_candidate
            if traditional_status == "已校对" and isinstance(traditional_candidate, str) and traditional_candidate
            else None
        )

        previous = entries.get(key)
        if previous is not None:
            if previous[0] != zh:
                raise ValueError(f"Conflicting zh-CN values for {key}: {previous[0]!r} vs {zh!r}")
            if previous[1] and english and previous[1] != english:
                raise ValueError(f"Conflicting en-US values for {key}: {previous[1]!r} vs {english!r}")
            if previous[2] and traditional and previous[2] != traditional:
                raise ValueError(f"Conflicting zh-TW values for {key}: {previous[2]!r} vs {traditional!r}")
            if previous[1] and not english:
                english = previous[1]
            if previous[2] and not traditional:
                traditional = previous[2]
        entries[key] = (zh, english, traditional)
    return entries


def render_js(locale: str, values: dict[str, str], total_keys: int) -> str:
    payload = json.dumps(values, ensure_ascii=False, indent=2, sort_keys=True)
    coverage = json.dumps({
        "activeKeys": total_keys,
        "approvedKeys": len(values),
        "complete": len(values) == total_keys,
    }, ensure_ascii=False, separators=(",", ":"))
    return (
        "'use strict';\n\n"
        "window.ShellbreakLocales = window.ShellbreakLocales || Object.create(null);\n"
        f"window.ShellbreakLocales[{json.dumps(locale)}] = Object.freeze({payload});\n"
        "window.ShellbreakLocaleCoverage = window.ShellbreakLocaleCoverage || Object.create(null);\n"
        f"window.ShellbreakLocaleCoverage[{json.dumps(locale)}] = Object.freeze({coverage});\n"
    )


def bundle_keys(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return set(re.findall(r'^\s*"([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)":', path.read_text(encoding="utf-8"), re.M))


def application_source_paths() -> list[Path]:
    """List application source files without generated dictionaries or docs."""
    paths = [ROOT / "index.html"]
    paths.extend((ROOT / "src").rglob("*.js"))
    paths.extend((ROOT / "electron").rglob("*.cjs"))
    return [path for path in paths if "locales" not in path.parts and "node_modules" not in path.parts]


def read_source(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return ""


def referenced_source_text() -> str:
    """Collect application source without generated dictionaries or docs."""
    chunks = []
    for path in application_source_paths():
        try:
            chunks.append(read_source(path))
        except OSError:
            continue
    return "\n".join(chunks)


def referenced_i18n_keys() -> dict[str, set[str]]:
    """Find literal translation keys in calls and static localization attributes."""
    references: dict[str, set[str]] = {}
    for path in application_source_paths():
        try:
            content = read_source(path)
        except OSError:
            continue
        relative = path.relative_to(ROOT).as_posix()
        for pattern in SOURCE_KEY_CALL_PATTERNS:
            for match in pattern.finditer(content):
                key = match.group(1)
                if key.startswith("store.steam."):
                    continue
                line = content.count("\n", 0, match.start()) + 1
                references.setdefault(key, set()).add(f"{relative}:{line}")
    return references


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if the generated bundles differ from the files on disk",
    )
    parser.add_argument(
        "--locale",
        choices=("all", "zh-CN", "en-US", "zh-TW"),
        default="all",
        help="limit export/check to one runtime locale (default: all)",
    )
    parser.add_argument(
        "--require-complete",
        action="store_true",
        help="fail if any active key lacks an approved translation in a selected non-baseline locale",
    )
    parser.add_argument(
        "--allow-orphan-prune",
        action="store_true",
        help="allow export to remove bundle keys that are absent from every registry row after reviewing them",
    )
    args = parser.parse_args()

    inventory = read_registry(INVENTORY)
    entries = locale_rows(inventory)
    if not entries:
        raise ValueError("No keyed text was found for the approved Chinese baseline")

    all_bundles = {
        "zh-CN": (ZH_OUT, render_js("zh-CN", {key: value[0] for key, value in entries.items()}, len(entries))),
        "en-US": (EN_OUT, render_js("en-US", {key: value[1] for key, value in entries.items() if value[1]}, len(entries))),
        "zh-TW": (TC_OUT, render_js("zh-TW", {key: value[2] for key, value in entries.items() if value[2]}, len(entries))),
    }
    selected = all_bundles if args.locale == "all" else {args.locale: all_bundles[args.locale]}

    registered_keys = {
        key for row in inventory
        if isinstance((key := row.get(COLUMNS["key"])), str) and KEY_PATTERN.fullmatch(key)
    }
    statuses_by_locale: dict[str, dict[str, set[str]]] = {}
    for locale in selected:
        status_column = COLUMNS["tc_status"] if locale == "zh-TW" else COLUMNS["status"]
        statuses_by_key: dict[str, set[str]] = {}
        for row in inventory:
            key = row.get(COLUMNS["key"])
            if isinstance(key, str) and key:
                statuses_by_key.setdefault(key, set()).add(str(row.get(status_column) or ""))
        statuses_by_locale[locale] = statuses_by_key
    locale_indexes = {"zh-CN": 0, "en-US": 1, "zh-TW": 2}
    expected_keys = {
        locale: {key for key, value in entries.items() if value[locale_indexes[locale]] is not None}
        for locale in selected
    }
    current_keys = {locale: bundle_keys(path) for locale, (path, _) in selected.items()}
    unregistered = {
        locale: keys - registered_keys
        for locale, keys in current_keys.items()
    }
    unregistered = {locale: keys for locale, keys in unregistered.items() if keys}
    source = referenced_source_text()
    source_key_references = referenced_i18n_keys()
    source_keys = set(source_key_references)
    source_unregistered = source_keys - registered_keys
    active_keys = set(entries)
    statuses_by_key: dict[str, set[str]] = {}
    for row in inventory:
        key = row.get(COLUMNS["key"])
        if isinstance(key, str) and key:
            statuses_by_key.setdefault(key, set()).add(str(row.get(COLUMNS["status"]) or ""))
    inactive_source_keys = (source_keys & registered_keys) - active_keys
    source_platform_only = {
        key for key in inactive_source_keys
        if statuses_by_key.get(key) and statuses_by_key[key] <= {"平台不适用", "语言无关"}
    }
    source_inactive = inactive_source_keys - source_platform_only
    referenced_stale = {
        locale: {key for key in keys - expected_keys[locale] if key in source}
        for locale, keys in current_keys.items()
    }
    referenced_stale = {locale: keys for locale, keys in referenced_stale.items() if keys}
    pending_stale = {
        locale: {
            key for key in keys - expected_keys[locale]
            if statuses_by_locale[locale].get(key, set()) & ACTIVE_TEXT_STATUSES
        }
        for locale, keys in current_keys.items()
    }
    pending_stale = {locale: keys for locale, keys in pending_stale.items() if keys}

    if args.check:
        if source_unregistered:
            print(f"SOURCE_UNREGISTERED: {len(source_unregistered)} literal translation keys in source have no registry row", file=sys.stderr)
            for key in sorted(source_unregistered):
                locations = ", ".join(sorted(source_key_references[key]))
                print(f"  {key} ({locations})", file=sys.stderr)
        if source_inactive:
            print(f"SOURCE_INACTIVE: {len(source_inactive)} literal translation keys in source are not active in the registry", file=sys.stderr)
            for key in sorted(source_inactive):
                locations = ", ".join(sorted(source_key_references[key]))
                print(f"  {key} ({locations})", file=sys.stderr)
        if source_platform_only:
            print(f"SOURCE_PLATFORM_ONLY: {len(source_platform_only)} source keys are explicitly marked platform-inapplicable or language-independent", file=sys.stderr)
        for locale, keys in unregistered.items():
            print(f"UNREGISTERED {locale}: {len(keys)} keys in the current bundle have no registry row", file=sys.stderr)
        for locale, keys in referenced_stale.items():
            print(f"REFERENCED {locale}: {len(keys)} current keys are still used by application source but lack approved registry translations", file=sys.stderr)
        for locale, keys in pending_stale.items():
            print(f"UNAPPROVED {locale}: {len(keys)} current bundle keys have active but unapproved registry rows", file=sys.stderr)
    elif source_unregistered or source_inactive or (not args.allow_orphan_prune and (unregistered or referenced_stale or pending_stale)):
        if source_unregistered:
            print(f"REFUSING export: {len(source_unregistered)} literal translation keys in source have no registry row", file=sys.stderr)
        if source_inactive:
            print(f"REFUSING export: {len(source_inactive)} literal translation keys in source are not active in the registry", file=sys.stderr)
        for locale, keys in unregistered.items():
            print(f"REFUSING {locale} export: {len(keys)} current bundle keys are missing from the registry; register/retire them or review --allow-orphan-prune", file=sys.stderr)
        for locale, keys in referenced_stale.items():
            print(f"REFUSING {locale} export: {len(keys)} current bundle keys are still referenced by application source but lack approved registry translations; reconcile them before export", file=sys.stderr)
        for locale, keys in pending_stale.items():
            print(f"REFUSING {locale} export: {len(keys)} current bundle keys have active but unapproved registry rows; review them before export", file=sys.stderr)
        return 2

    missing = {
        locale: [key for key, value in entries.items() if locale != "zh-CN" and value[1 if locale == "en-US" else 2] is None]
        for locale in selected
    }
    incomplete = {locale: keys for locale, keys in missing.items() if keys} if args.require_complete else {}

    if args.check:
        stale = []
        for path, expected in selected.values():
            actual = path.read_text(encoding="utf-8") if path.exists() else None
            if actual != expected:
                stale.append(str(path.relative_to(ROOT)))
        for locale, keys in incomplete.items():
            print(f"INCOMPLETE {locale}: {len(keys)}/{len(entries)} active keys lack approved translations", file=sys.stderr)
        if stale:
            print("STALE locale bundles: " + ", ".join(stale), file=sys.stderr)
        if source_unregistered or source_inactive or incomplete or stale:
            return 1
        print("Locale bundles are up to date (regeneration produces no diff).")
        return 0

    if incomplete:
        for locale, keys in incomplete.items():
            print(f"INCOMPLETE {locale}: {len(keys)}/{len(entries)} active keys lack approved translations", file=sys.stderr)
        return 1

    for path, content in selected.values():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="\n")
    counts = {locale: len(entries) - len(missing.get(locale, [])) for locale in selected}
    print("Exported " + ", ".join(f"{count} {locale} keys" for locale, count in counts.items()) + f" from {len(inventory)} registry rows")
    print(f"  source: {INVENTORY.relative_to(ROOT)}")
    for locale, (path, _) in selected.items():
        print(f"  {locale}: {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
