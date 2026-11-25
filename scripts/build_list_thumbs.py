"""Regenerate the WebP images used by achievement and challenge lists (requires Pillow)."""
import argparse
from io import BytesIO
from pathlib import Path
import re
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
THUMB = re.compile(r"assets/(?:achievements|challenges)/thumbs/[\w.-]+\.webp")
RASTERS = {".png", ".webp", ".jpg", ".jpeg"}


def render(target):
    originals = [p for p in target.parent.parent.glob(target.stem + ".*")
                 if p.suffix.lower() in RASTERS]
    if len(originals) != 1:
        raise ValueError(f"{target.relative_to(ROOT)} needs one matching original, found {len(originals)}")
    # Veil challenge cards use larger illustrations than the other list badges.
    edge, quality = (160, 82) if target.name.startswith("challenge-veil-") else (128, 84)
    with Image.open(originals[0]) as original:
        image = original.convert("RGBA")
        image.thumbnail((edge, edge), Image.Resampling.LANCZOS)
        output = BytesIO()
        image.save(output, "WEBP", quality=quality, method=6)
        return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report missing or changed thumbnails")
    args = parser.parse_args()
    refs = set()
    for path in (ROOT / "src").rglob("*.js"):
        refs.update(THUMB.findall(path.read_text(encoding="utf-8")))
    if not refs:
        raise ValueError("No badge thumbnails referenced in src/")
    changed = []
    for ref in sorted(refs):
        target = ROOT / ref
        encoded = render(target)
        if target.is_file() and target.read_bytes() == encoded:
            continue
        changed.append(ref)
        if not args.check:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(encoded)
    if args.check and changed:
        sys.exit("Run assets:thumbs to update:\n" + "\n".join(changed))
    print(f"{len(refs)} referenced thumbnails, {len(changed)} changed")


if __name__ == "__main__":
    main()
