#!/usr/bin/env python3
"""Build the full-content Xiaohongshu MiniTool package candidate."""

from __future__ import annotations

import base64
import argparse
import io
import json
import re
import shutil
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist" / "xiaohongshu"
SOURCE = DIST / "package"
PACKAGE = DIST / "package-release-r2"
ARCHIVE = DIST / "shellbreak-xhs-release-r2.zip"
REPORT = DIST / "xhs-release-report-r2.json"
MAX_FILES = 200
MAX_ZIP_BYTES = 10 * 1024 * 1024
STATIC_IMAGE_QUALITY = 74
STATIC_IMAGE_ALPHA_QUALITY = 80
DYNAMIC_RASTER_ROOTS = {"resource-icons", "company-icons", "war"}
SUPPORTED_SUFFIXES = {
    ".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".webp",
    ".svg", ".woff", ".woff2", ".json",
}

ASSET_REFERENCE = re.compile(
    r"(?P<prefix>(?:\.\./|\./|/)?assets/)"
    r"(?P<path>[A-Za-z0-9_./\-\u0080-\uffff]+\.(?:png|jpe?g|webp|gif|svg|woff2?|ttf))"
    r"(?P<query>\?[^\"')\s]*)?",
    re.IGNORECASE,
)

TRANSPARENT_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1">'
    '<path fill="none" d="M0 0h1v1H0z"/></svg>\n'
)


def check_inside(path: Path, parent: Path) -> None:
    target = path.resolve()
    base = parent.resolve()
    if target == base or base not in target.parents:
        raise SystemExit(f"Refusing to replace path outside {base}: {target}")


def reset_dir(path: Path) -> None:
    check_inside(path, DIST)
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True)


def enable_test_only_star_map_unlock() -> None:
    index_path = PACKAGE / "index.html"
    index = index_path.read_text(encoding="utf-8")
    index, count = re.subn(
        r'(<script src="src/xhs-platform\.js(?:\?[^"]*)?")(?=></script>)',
        r'\1 data-test-unlock-star-map',
        index,
    )
    if count != 1:
        raise SystemExit("Could not set the MiniTool preview's Star Map flag")
    index_path.write_bytes(index.encode("utf-8"))


def embed_static_rasters(files: list[Path], source_assets: Path) -> dict[str, str]:
    """Encode each static raster independently so clients never need SVG view cropping."""
    mapping: dict[str, str] = {}
    for path in files:
        with Image.open(path) as source:
            image = source.convert("RGBA")
        webp_buffer = io.BytesIO()
        image.save(
            webp_buffer,
            "WEBP",
            quality=STATIC_IMAGE_QUALITY,
            method=6,
            alpha_quality=STATIC_IMAGE_ALPHA_QUALITY,
        )
        data_uri = "data:image/webp;base64," + base64.b64encode(webp_buffer.getvalue()).decode("ascii")
        rel = path.relative_to(source_assets).as_posix()
        mapping[rel.casefold()] = data_uri
    return mapping


def patch_removed_backgrounds(text_path: Path, text: str) -> tuple[str, int]:
    changed = 0
    if text_path.name == "background.js":
        pattern = re.compile(r"for \(var i = 1; i <= 8; i\+\+\) \{\s*frames\[i\] = \[[\s\S]*?\n\s*\];\s*\}")
        replacement = "for (var i = 1; i <= 8; i++) frames[i] = ['assets/xhs-background-placeholder.svg'];"
        text, n = pattern.subn(replacement, text, count=1)
        if n != 1:
            raise SystemExit("Could not remove the era background frame list")
        changed += n
    if text_path.name == "render.js":
        drift_old = "src=\"assets/backgrounds/sequence/era-10/drift-terra/' + frameFiles[i] + '\""
        drift_new = 'src="assets/xhs-background-placeholder.svg"'
        if drift_old not in text:
            raise SystemExit("Could not remove the drift-terra finale background sequence")
        text = text.replace(drift_old, drift_new, 1)
        changed += 1

        ending_old = "src=\"' + story.root + '/' + fileNames[i] + '\" alt=\""
        ending_new = 'src="assets/xhs-background-placeholder.svg" alt="'
        if ending_old not in text:
            raise SystemExit("Could not remove the Dyson finale background sequence")
        text = text.replace(ending_old, ending_new, 1)
        changed += 1
        for dead_root in (
            "        root: 'assets/backgrounds/sequence/era-10/ascend-void',\n",
            "        root: 'assets/backgrounds/sequence/era-10',\n",
        ):
            if dead_root not in text:
                raise SystemExit("Could not remove an unused background root")
            text = text.replace(dead_root, "", 1)
            changed += 1
    return text, changed


def pack_assets() -> dict[str, Any]:
    source_assets = SOURCE / "assets"
    output_assets = PACKAGE / "assets"
    output_assets.mkdir(parents=True, exist_ok=True)
    dynamic_count = svg_count = font_count = 0
    static_rasters: list[Path] = []

    for path in sorted(source_assets.rglob("*")):
        if not path.is_file() or path.is_symlink():
            continue
        rel = path.relative_to(source_assets)
        if any(part.startswith(".") or part == "__MACOSX" for part in rel.parts):
            continue
        suffix = path.suffix.lower()
        category = rel.parts[0].casefold() if len(rel.parts) > 1 else "root"
        if category == "backgrounds":
            continue
        if suffix in {".webp", ".png", ".jpg", ".jpeg", ".gif"}:
            if category in DYNAMIC_RASTER_ROOTS:
                destination = output_assets / rel
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, destination)
                dynamic_count += 1
            else:
                static_rasters.append(path)
        else:
            destination = output_assets / rel
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, destination)
            if suffix == ".svg":
                svg_count += 1
            elif suffix in {".woff", ".woff2"}:
                font_count += 1

    mapping = embed_static_rasters(static_rasters, source_assets)
    placeholder = output_assets / "xhs-background-placeholder.svg"
    placeholder.write_text(TRANSPARENT_SVG, encoding="utf-8")

    text_files = [PACKAGE / "index.html", *PACKAGE.rglob("*.js"), *PACKAGE.rglob("*.css"), *PACKAGE.rglob("*.json")]
    ref_count = 0
    background_patches = 0
    for text_path in text_files:
        original = text_path.read_text(encoding="utf-8")
        original, bg_changed = patch_removed_backgrounds(text_path, original)
        background_patches += bg_changed
        original = re.sub(
            r"(?P<prefix>(?:\.\./|\./|/)?assets/)backgrounds/[A-Za-z0-9_./\-\u0080-\uffff]+\.(?:png|jpe?g|webp|gif|svg)(?P<query>\?[^\"')\s]*)?",
            lambda m: m.group("prefix") + "xhs-background-placeholder.svg" + (m.group("query") or ""),
            original,
            flags=re.IGNORECASE,
        )

        def replace_ref(match: re.Match[str]) -> str:
            nonlocal ref_count
            rel = match.group("path").replace("\\", "/")
            lower = rel.casefold()
            if lower not in mapping:
                return match.group(0)
            ref_count += 1
            return mapping[lower]

        updated = ASSET_REFERENCE.sub(replace_ref, original)
        if updated != text_path.read_text(encoding="utf-8"):
            text_path.write_bytes(updated.encode("utf-8"))

    unresolved: list[str] = []
    for text_path in text_files:
        text = text_path.read_text(encoding="utf-8", errors="ignore")
        for match in ASSET_REFERENCE.finditer(text):
            rel = match.group("path").replace("\\", "/")
            target = PACKAGE / "assets" / rel
            if not target.is_file():
                unresolved.append(f"{text_path.relative_to(PACKAGE).as_posix()}: {match.group(0)}")

    return {
        "sourceRasterFiles": len(static_rasters) + dynamic_count,
        "staticRasterFilesEmbedded": len(static_rasters),
        "dynamicRasterFilesKept": dynamic_count,
        "sourceSvgFilesKept": svg_count,
        "fontFilesKept": font_count,
        "staticReferencesRewritten": ref_count,
        "backgroundSequencesRemoved": background_patches,
        "unresolvedAssetReferences": unresolved,
    }


def check_platform_entries() -> tuple[dict[str, int], dict[str, bool]]:
    index = (PACKAGE / "index.html").read_text(encoding="utf-8")
    pane = (PACKAGE / "src" / "ui" / "render-pane-star-map.js").read_text(encoding="utf-8")
    save_transfer = (PACKAGE / "src" / "save-transfer.js").read_text(encoding="utf-8")
    css = PACKAGE / "css" / "xhs-star-map.css"
    runtime = PACKAGE / "src" / "ui" / "xhs-star-map.js"

    if not css.is_file() or not runtime.is_file() or "xhs-star-map.js" not in index or "xhs-star-map.css" not in index:
        raise SystemExit("The staged MiniTool is missing its single-page Star Map. Run scripts/stage_xhs_build.py again.")
    if "star-map-iframe.js" in index or (PACKAGE / "src" / "ui" / "star-map-iframe.js").exists() or re.search(r"<\s*(?:iframe|object)\b", pane, flags=re.I):
        raise SystemExit("The staged MiniTool contains the browser Star Map. Run scripts/stage_xhs_build.py again.")
    if "save-transfer-browser.js" in index or (PACKAGE / "src" / "save-transfer-browser.js").exists() or any(
        token in save_transfer for token in ("navigator.clipboard", ".download =", "createObjectURL", "downloadFile(")
    ):
        raise SystemExit("The staged MiniTool contains browser save output. Run scripts/stage_xhs_build.py again.")
    if "data-test-unlock-star-map" in index:
        raise SystemExit("A test-only Star Map flag leaked into the staging copy.")
    return (
        {"stylesChars": len(css.read_text(encoding="utf-8").rstrip()), "runtimeChars": len(runtime.read_text(encoding="utf-8"))},
        {"manualCopy": True, "fileExport": False, "fileImport": True},
    )


def build_zip(test_unlock_star_map: bool = False) -> dict[str, Any]:
    if not SOURCE.is_dir() or not (SOURCE / "index.html").is_file():
        raise SystemExit("Run scripts/stage_xhs_build.py first")
    check_inside(PACKAGE, DIST)
    check_inside(ARCHIVE, DIST)
    check_inside(REPORT, DIST)
    reset_dir(PACKAGE)

    for item in ("index.html", "src", "css"):
        src = SOURCE / item
        dst = PACKAGE / item
        if src.is_dir():
            def ignore(directory: str, names: list[str]) -> set[str]:
                base = Path(directory)
                return {name for name in names if name.startswith(".") or name == "__MACOSX" or (base / name).is_symlink()}
            shutil.copytree(src, dst, ignore=ignore)
        else:
            shutil.copy2(src, dst)

    star_map, save_io = check_platform_entries()
    if test_unlock_star_map:
        enable_test_only_star_map_unlock()
    assets = pack_assets()
    file_list = sorted(path for path in PACKAGE.rglob("*") if path.is_file())
    bad_types = [path.relative_to(PACKAGE).as_posix() for path in file_list if path.suffix.lower() not in SUPPORTED_SUFFIXES]
    html_files = [path.relative_to(PACKAGE).as_posix() for path in file_list if path.suffix.lower() == ".html"]
    html_text = "\n".join(path.read_text(encoding="utf-8", errors="ignore") for path in PACKAGE.rglob("*.html"))
    html_inline_scripts = len(re.findall(r"<script\b(?![^>]*\bsrc=)[^>]*>", html_text, flags=re.IGNORECASE))
    html_inline_handlers = len(re.findall(r"\son[a-z]+\s*=", html_text, flags=re.IGNORECASE))
    html_blocked_tags = bool(re.search(r"<\s*(?:iframe|object)\b", html_text, flags=re.IGNORECASE))

    if ARCHIVE.exists():
        ARCHIVE.unlink()
    with zipfile.ZipFile(ARCHIVE, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in file_list:
            archive.write(path, path.relative_to(PACKAGE).as_posix())
    with zipfile.ZipFile(ARCHIVE) as archive:
        bad_member = archive.testzip()
        names = archive.namelist()
        unsafe = [name for name in names if name.startswith(("/", "\\")) or ".." in Path(name).parts]

    report = {
        "packageRoot": str(PACKAGE),
        "archive": str(ARCHIVE),
        "zipBytes": ARCHIVE.stat().st_size,
        "zipMiB": round(ARCHIVE.stat().st_size / (1024 * 1024), 3),
        "fileCount": len(file_list),
        "zipEntryCount": len(names),
        "htmlFiles": html_files,
        "badFileTypes": bad_types,
        "inlineScriptsInHtml": html_inline_scripts,
        "inlineHandlersInHtml": html_inline_handlers,
        "iframeOrObjectInHtml": html_blocked_tags,
        "unsafeZipPaths": unsafe,
        "zipIntegrityError": bad_member,
        "nativeStarMap": star_map,
        "testOnlyStarMapUnlock": {"enabled": test_unlock_star_map},
        "xhsSaveIo": save_io,
        "assets": assets,
        "rasterEncoding": {"format": "WebP", "quality": STATIC_IMAGE_QUALITY, "alphaQuality": STATIC_IMAGE_ALPHA_QUALITY, "embedding": "individual-data-uri"},
        "visualScope": "Static XHS raster artwork embedded as individually cropped WebP data URIs; backgrounds and BGM remain excluded per the agreed XHS asset branch. The star-map view, controls, game-state bridge, and building panel are mounted in the single-page document.",
    }
    failures: list[str] = []
    if len(file_list) > MAX_FILES:
        failures.append("file-count-over-200")
    if ARCHIVE.stat().st_size > MAX_ZIP_BYTES:
        failures.append("zip-over-10MiB")
    if html_files != ["index.html"]:
        failures.append("entry-html-count-or-location")
    if bad_types or html_inline_scripts or html_inline_handlers or html_blocked_tags or unsafe or bad_member:
        failures.append("package-integrity-or-container-rule")
    if assets["unresolvedAssetReferences"]:
        failures.append("unresolved-assets")
    report["status"] = ("test-preview-ready" if test_unlock_star_map else "release-candidate-ready") if not failures else "failed"
    report["failures"] = failures
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit("XHS release package failed: " + ", ".join(failures))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build the XHS mini-tool package.")
    parser.add_argument(
        "--test-unlock-star-map",
        action="store_true",
        help="Build an isolated test-preview package with the Star Map open from the first run.",
    )
    parser.add_argument(
        "--tag",
        default=None,
        help="Output tag to keep rebuilt archives and reports separate from earlier artifacts.",
    )
    args = parser.parse_args()
    tag = args.tag or ("r4" if args.test_unlock_star_map else "r3")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", tag):
        parser.error("--tag may contain only letters, digits, underscores, and hyphens")
    if args.test_unlock_star_map:
        PACKAGE = DIST / f"package-preview-star-map-{tag}"
        ARCHIVE = DIST / f"shellbreak-xhs-star-map-test-{tag}.zip"
        REPORT = DIST / f"xhs-star-map-test-report-{tag}.json"
    else:
        PACKAGE = DIST / f"package-release-{tag}"
        ARCHIVE = DIST / f"shellbreak-xhs-release-{tag}.zip"
        REPORT = DIST / f"xhs-release-report-{tag}.json"
    build_zip(test_unlock_star_map=args.test_unlock_star_map)
