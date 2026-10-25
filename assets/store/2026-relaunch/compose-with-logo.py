from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'source'
LOGO_PATH = ROOT / '09-pc-logo-1280x720-v2.png'
LANDSCAPE = Image.open(SOURCE / 'key-visual-16x9-no-text.png').convert('RGB')
PORTRAIT = Image.open(SOURCE / 'key-visual-portrait-no-text.png').convert('RGB')
LOGO = Image.open(LOGO_PATH).convert('RGBA')

def cover_crop(image, size, anchor=(0.5, 0.5)):
    tw, th = size
    sw, sh = image.size
    scale = max(tw / sw, th / sh)
    nw, nh = round(sw * scale), round(sh * scale)
    image = image.resize((nw, nh), Image.Resampling.LANCZOS)
    left = max(0, min(round((nw - tw) * anchor[0]), nw - tw))
    top = max(0, min(round((nh - th) * anchor[1]), nh - th))
    return image.crop((left, top, left + tw, top + th)).convert('RGBA')

def place_logo(base, width, xy):
    logo = LOGO.resize((width, round(LOGO.height * width / LOGO.width)), Image.Resampling.LANCZOS)
    base.alpha_composite(logo, xy)
    return base.convert('RGB')

def save(name, image, quality=91):
    image.save(ROOT / name, quality=quality, optimize=True, progressive=True, subsampling=0)

hero = cover_crop(LANDSCAPE, (1920, 1080), (0.5, 0.5))
save('10-promo-1920x1080-logo-v2.jpg', place_logo(hero, 980, (38, 512)), 91)

square = cover_crop(LANDSCAPE, (1440, 1440), (0.56, 0.5))
save('11-promo-square-1440-logo-v2.jpg', place_logo(square, 1180, (130, 760)), 90)

pc_land = cover_crop(LANDSCAPE, (460, 215), (0.5, 0.58))
save('12-pc-cover-460x215-logo-v2.jpg', place_logo(pc_land, 364, (48, 5)), 92)

pc_portrait = cover_crop(PORTRAIT, (600, 900), (0.5, 0.5))
save('13-pc-cover-600x900-logo-v2.jpg', place_logo(pc_portrait, 500, (50, 600)), 91)

for name in ['10-promo-1920x1080-logo-v2.jpg', '11-promo-square-1440-logo-v2.jpg', '12-pc-cover-460x215-logo-v2.jpg', '13-pc-cover-600x900-logo-v2.jpg']:
    p = ROOT / name
    im = Image.open(p)
    print(f'{name}\t{im.width}x{im.height}\t{p.stat().st_size} bytes')
