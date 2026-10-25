from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import shutil

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source"
SOURCE.mkdir(parents=True, exist_ok=True)

GENERATED = Path(r"C:\Users\Administrator\.codex\generated_images\01a16102-f4e7-7aa1-90e9-7b01cea76e8b")
INPUTS = {
    "key-visual-16x9-no-text.png": GENERATED / "exec-b04f4df0-af76-43af-a893-38f62e2d2144.png",
    "key-visual-portrait-no-text.png": GENERATED / "exec-b62e7eea-5ae3-4f27-bf72-6b9e43e93660.png",
    "icon-no-text.png": GENERATED / "exec-ce05ed4b-5392-48ef-981e-8aee636dce09.png",
}
for name, path in INPUTS.items():
    destination = SOURCE / name
    if not destination.exists() and path.exists():
        shutil.copy2(path, destination)

TITLE_LINES = ("自海渊至群星：", "深海文明建设")
FONT_PATH = r"C:\Windows\Fonts\msyhbd.ttc"


def cover_crop(image, size, anchor=(0.5, 0.5)):
    tw, th = size
    sw, sh = image.size
    scale = max(tw / sw, th / sh)
    nw, nh = round(sw * scale), round(sh * scale)
    image = image.resize((nw, nh), Image.Resampling.LANCZOS)
    left = round((nw - tw) * anchor[0])
    top = round((nh - th) * anchor[1])
    left = max(0, min(left, nw - tw))
    top = max(0, min(top, nh - th))
    return image.crop((left, top, left + tw, top + th))


def title_overlay(image, font_size, xy, gap, stroke_width):
    image = image.convert("RGBA")
    font = ImageFont.truetype(FONT_PATH, font_size)
    x, y = xy
    # A soft, local shadow keeps the exact title readable without adding extra copy.
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    for line in TITLE_LINES:
        sd.text((x + 3, y + 5), line, font=font, fill=(0, 7, 17, 205), stroke_width=stroke_width + 2, stroke_fill=(0, 7, 17, 185))
        y += font_size + gap
    image = Image.alpha_composite(image, shadow.filter(ImageFilter.GaussianBlur(5)))
    draw = ImageDraw.Draw(image)
    y = xy[1]
    for i, line in enumerate(TITLE_LINES):
        draw.text((xy[0], y), line, font=font, fill=(243, 251, 255, 255), stroke_width=stroke_width, stroke_fill=(4, 36, 53, 225))
        y += font_size + gap
    return image


landscape = Image.open(SOURCE / "key-visual-16x9-no-text.png").convert("RGB")
portrait = Image.open(SOURCE / "key-visual-portrait-no-text.png").convert("RGB")
icon = Image.open(SOURCE / "icon-no-text.png").convert("RGB")

# Shared 16:9 hero image for the TapTap listing and mini-game promotional material.
hero = cover_crop(landscape, (1920, 1080), (0.5, 0.5))
hero = title_overlay(hero, 76, (78, 795), 9, 2).convert("RGB")
hero.save(ROOT / "01-promo-1920x1080.jpg", quality=91, optimize=True, progressive=True, subsampling=0)

# The square artwork is cropped from the same key visual so both placements share one campaign image.
square_source = cover_crop(landscape, (941, 941), (0.56, 0.5))
square = square_source.resize((1440, 1440), Image.Resampling.LANCZOS)
square = title_overlay(square, 78, (72, 1165), 10, 2).convert("RGB")
square.save(ROOT / "02-promo-square-1440.jpg", quality=90, optimize=True, progressive=True, subsampling=0)

# PC icon: square, opaque, no self-rounded mask.
icon512 = cover_crop(icon, (512, 512))
icon512.save(ROOT / "03-pc-icon-512.png", optimize=True)

# PC landscape cover; keep the title compact and within the dark foreground.
pc_land = cover_crop(landscape, (460, 215), (0.5, 0.58))
pc_land = title_overlay(pc_land, 24, (18, 121), 2, 1).convert("RGB")
pc_land.save(ROOT / "04-pc-cover-460x215.jpg", quality=92, optimize=True, subsampling=0)

# Portrait cover uses its own vertical composition and the same exact title lockup.
pc_portrait = cover_crop(portrait, (600, 900), (0.5, 0.5))
pc_portrait = title_overlay(pc_portrait, 42, (24, 34), 4, 1).convert("RGB")
pc_portrait.save(ROOT / "05-pc-cover-600x900.jpg", quality=91, optimize=True, progressive=True, subsampling=0)

# Text-free PC library wallpaper; top-center crop preserves the ice horizon, city and Dyson sphere.
wallpaper = cover_crop(landscape, (3840, 1240), (0.5, 0.39))
wallpaper.save(ROOT / "06-pc-library-3840x1240.jpg", quality=91, optimize=True, progressive=True, subsampling=0)

# Transparent standalone logo. Only the game title is rendered, matching TapTap's logo canvas dimensions.
logo = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
font = ImageFont.truetype(FONT_PATH, 132)
draw = ImageDraw.Draw(logo)
line_widths = [draw.textbbox((0, 0), line, font=font, stroke_width=2)[2] for line in TITLE_LINES]
y = (720 - (132 * 2 + 16)) // 2
for line, width in zip(TITLE_LINES, line_widths):
    x = (1280 - width) // 2
    draw.text((x + 2, y + 4), line, font=font, fill=(0, 7, 17, 190), stroke_width=4, stroke_fill=(0, 7, 17, 150))
    draw.text((x, y), line, font=font, fill=(244, 251, 255, 255), stroke_width=2, stroke_fill=(12, 59, 81, 230))
    y += 148
logo.save(ROOT / "07-pc-logo-1280x720.png", optimize=True)

print("Created:")
for path in sorted(ROOT.glob("0*")):
    if not path.is_file() or path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
        continue
    with Image.open(path) as im:
        print(f"{path.name}\t{im.width}x{im.height}\t{path.stat().st_size} bytes")
