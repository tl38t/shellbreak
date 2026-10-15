from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


ROOT = Path("D:/shellbreak/assets/store")
SOURCE = Path(
    "C:/Users/Administrator/.codex/generated_images/"
    "01a11616-8bd9-7e92-9742-a25d1b8605ea/"
    "exec-79dabaf1-123c-4d74-8778-6695fe70049c.png"
)
LANCZOS = Image.Resampling.LANCZOS


def fit(image: Image.Image, size: tuple[int, int], center=(0.5, 0.5)) -> Image.Image:
    return ImageOps.fit(image, size, method=LANCZOS, centering=center)


def place_logo(base: Image.Image, logo: Image.Image, max_size, position, shade=None) -> Image.Image:
    result = base.convert("RGBA")
    if shade is not None:
        result.alpha_composite(shade)
    mark = logo.copy()
    mark.thumbnail(max_size, LANCZOS)
    result.alpha_composite(mark, position)
    return result


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    logo = Image.open(ROOT / "logo-yuanhai-tianque-v1.png").convert("RGBA")
    alpha_bbox = logo.getchannel("A").getbbox()
    if alpha_bbox:
        logo = logo.crop(alpha_bbox)
    scene = Image.open(SOURCE).convert("RGB")

    logo_canvas = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
    logo_mark = logo.copy()
    logo_mark.thumbnail((1180, 570), LANCZOS)
    logo_canvas.alpha_composite(
        logo_mark,
        ((1280 - logo_mark.width) // 2, (720 - logo_mark.height) // 2),
    )
    logo_canvas.save(ROOT / "logo-yuanhai-tianque-1280x720.png", format="PNG", optimize=True)

    fit(scene, (1920, 1080)).save(
        ROOT / "promo-no-logo-1920x1080.jpg",
        format="JPEG",
        quality=92,
        optimize=True,
        progressive=True,
    )
    fit(scene, (720, 1080), (0.68, 0.42)).save(
        ROOT / "promo-no-logo-720x1080.jpg",
        format="JPEG",
        quality=92,
        optimize=True,
        progressive=True,
    )
    fit(scene, (3840, 1240), (0.62, 0.45)).save(
        ROOT / "game-library-background-3840x1240.jpg",
        format="JPEG",
        quality=92,
        optimize=True,
        progressive=True,
    )

    landscape = fit(scene, (460, 215), (0.5, 0.44)).convert("RGBA")
    landscape_shade = Image.new("RGBA", landscape.size, (0, 0, 0, 0))
    ImageDraw.Draw(landscape_shade).rectangle(
        (0, 0, 285, 215), fill=(3, 20, 35, 135)
    )
    place_logo(landscape, logo, (245, 150), (18, 30), landscape_shade).convert("RGB").save(
        ROOT / "cover-landscape-460x215.jpg",
        format="JPEG",
        quality=94,
        optimize=True,
    )

    portrait = fit(scene, (600, 900), (0.68, 0.42)).convert("RGBA")
    portrait_shade = Image.new("RGBA", portrait.size, (0, 0, 0, 0))
    ImageDraw.Draw(portrait_shade).rectangle(
        (0, 0, 600, 330), fill=(3, 20, 35, 125)
    )
    place_logo(portrait, logo, (510, 260), (45, 65), portrait_shade).convert("RGB").save(
        ROOT / "cover-portrait-600x900.jpg",
        format="JPEG",
        quality=94,
        optimize=True,
    )

    print("created 6 TapTap assets")


if __name__ == "__main__":
    main()
