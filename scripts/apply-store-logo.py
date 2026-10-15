from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1] / "assets" / "store"
LOGO = Image.open(ROOT / "logo-yuanhai-tianque-new.png").convert("RGBA")
LOGO = LOGO.crop(LOGO.getbbox())


def paste_logo(base: Image.Image, width: int, xy: tuple[int, int]) -> Image.Image:
    layer = LOGO.resize(
        (width, round(LOGO.height * width / LOGO.width)),
        Image.Resampling.LANCZOS,
    )
    base.paste(layer, xy, layer)
    return base


# Portrait cover: rebuild from the clean 9:16 background, then place the new mark.
portrait = Image.open(ROOT / "promo-no-logo-720x1080.jpg").convert("RGB")
portrait = portrait.resize((600, 900), Image.Resampling.LANCZOS)
paste_logo(portrait, 520, (40, 30))
portrait.save(
    ROOT / "cover-portrait-600x900-new-logo.jpg",
    "JPEG",
    quality=95,
    subsampling=0,
    optimize=True,
)


# Landscape cover: crop the clean 16:9 background to the existing 460:215 cover ratio.
landscape = Image.open(ROOT / "promo-no-logo-1920x1080.jpg").convert("RGB")
landscape = landscape.resize((460, 259), Image.Resampling.LANCZOS)
landscape = landscape.crop((0, 22, 460, 237))
paste_logo(landscape, 220, (18, 10))
landscape.save(
    ROOT / "cover-landscape-460x215-new-logo.jpg",
    "JPEG",
    quality=95,
    subsampling=0,
    optimize=True,
)


# Promotional image: preserve the clean 1920x1080 background and use a generous logo lockup.
promo = Image.open(ROOT / "promo-no-logo-1920x1080.jpg").convert("RGB")
paste_logo(promo, 700, (80, 40))
promo.save(ROOT / "promo-shellbreak-1920x1080-new-logo.png", "PNG", optimize=True)

print(f"logo content: {LOGO.size[0]}x{LOGO.size[1]}")
for name in (
    "cover-portrait-600x900-new-logo.jpg",
    "cover-landscape-460x215-new-logo.jpg",
    "promo-shellbreak-1920x1080-new-logo.png",
):
    path = ROOT / name
    print(f"{name}: {Image.open(path).size} / {path.stat().st_size} bytes")
