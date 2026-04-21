#!/usr/bin/env python3
"""
Build the iOS LaunchScreen splash so it matches the new HTML boot splash
(American flag hero + floating CarryOn logo). Writes three copies into
ios/App/App/Assets.xcassets/Splash.imageset/ for 1x / 2x / 3x @ 2732×2732.

Run whenever /app/frontend/public/flag-bg.jpg or /carryon-logo.png changes.

    python3 /app/scripts/build_ios_splash.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path("/app/frontend")
FLAG = ROOT / "public" / "flag-bg.jpg"
LOGO = ROOT / "public" / "carryon-logo.png"
OUT_DIR = ROOT / "ios/App/App/Assets.xcassets/Splash.imageset"
OUT_FILES = [
    "splash-2732x2732.png",    # 3x
    "splash-2732x2732-1.png",  # 2x
    "splash-2732x2732-2.png",  # 1x
]
SIZE = 2732  # square canvas (covers iPad Pro 12.9 portrait + landscape)
BG_RGB = (11, 18, 33)  # #0B1221 — matches HTML splash base


def _cover(img: Image.Image, side: int) -> Image.Image:
    """Scale `img` to cover a `side × side` square (aspect-fill, center crop)."""
    w, h = img.size
    scale = side / min(w, h)
    nw, nh = int(w * scale + 0.5), int(h * scale + 0.5)
    img = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - side) // 2
    top = (nh - side) // 2
    return img.crop((left, top, left + side, top + side))


def _radial_gradient(side: int, cx_frac: float, cy_frac: float,
                     rx_frac: float, ry_frac: float,
                     color: tuple[int, int, int, int]) -> Image.Image:
    """Generate a radial-gradient overlay that fades `color` at the center
    to fully transparent at the edge. `cx/cy/rx/ry` are fractions of `side`.

    This replicates the CSS:
      radial-gradient(ellipse Wx Hy at Cx Cy, rgba(...) 0%, transparent 100%)
    """
    cx, cy = cx_frac * side, cy_frac * side
    rx, ry = rx_frac * side, ry_frac * side
    yy, xx = np.meshgrid(
        np.arange(side, dtype=np.float32),
        np.arange(side, dtype=np.float32),
        indexing="ij",
    )
    d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    alpha = np.clip(1.0 - d, 0.0, 1.0)
    alpha = (alpha * color[3]).astype(np.uint8)
    rgb = np.stack([
        np.full_like(alpha, color[0]),
        np.full_like(alpha, color[1]),
        np.full_like(alpha, color[2]),
    ], axis=-1).astype(np.uint8)
    rgba = np.dstack([rgb, alpha])
    return Image.fromarray(rgba, mode="RGBA")


def build() -> Image.Image:
    # 1. Base canvas (navy).
    canvas = Image.new("RGB", (SIZE, SIZE), BG_RGB)

    # 2. Flag hero — aspect-fill, brightness/contrast/saturation match CSS.
    flag = Image.open(FLAG).convert("RGB")
    flag = _cover(flag, SIZE)
    flag = ImageEnhance.Brightness(flag).enhance(1.30)
    flag = ImageEnhance.Contrast(flag).enhance(1.05)
    flag = ImageEnhance.Color(flag).enhance(1.10)
    # Blend flag over navy at 0.85 opacity to mirror the CSS opacity.
    flag_rgba = flag.convert("RGBA")
    flag_rgba.putalpha(int(255 * 0.85))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), flag_rgba)

    # 3. Four atmospheric overlays — exact copies of the CSS radial gradients.
    overlays = [
        # Bottom linear fade (CSS: linear-gradient(180deg, ..0 → ..0.35 at bottom))
        # Approximate with a vertical gradient by using a wide radial at (0.5, 1.0).
        _radial_gradient(SIZE, 0.5, 1.0, 0.9, 1.0, (14, 24, 41, int(255 * 0.35))),
        # highlight: ellipse 90% 80% at 20% 80%, rgba(255,255,255,0.12)
        _radial_gradient(SIZE, 0.20, 0.80, 0.90, 0.80, (255, 255, 255, int(255 * 0.12))),
        # highlight: ellipse 80% 60% at 10% 50%, rgba(255,255,255,0.08)
        _radial_gradient(SIZE, 0.10, 0.50, 0.80, 0.60, (255, 255, 255, int(255 * 0.08))),
        # highlight: ellipse 80% 70% at 85% 85%, rgba(255,255,255,0.14)
        _radial_gradient(SIZE, 0.85, 0.85, 0.80, 0.70, (255, 255, 255, int(255 * 0.14))),
        # gold hotspot: ellipse 70% 50% at 35% 50%, rgba(212,175,55,0.06)
        _radial_gradient(SIZE, 0.35, 0.50, 0.70, 0.50, (212, 175, 55, int(255 * 0.06))),
    ]
    for ov in overlays:
        canvas = Image.alpha_composite(canvas, ov)

    # 4. Logo in the center — target width ≈ 62% of the canvas to match
    #    the CSS `width:min(62vw,280px)` on a phone viewport. Since the
    #    launch screen is a universal 2732 square and the logo renders
    #    centered on any device size, a slightly smaller 42% reads well
    #    on both phone and iPad (on phone the storyboard scale-aspect-
    #    fills the square, so the logo lands at roughly 60%+ of the
    #    narrow side — exactly what we want visually).
    logo = Image.open(LOGO).convert("RGBA")
    target_w = int(SIZE * 0.42)
    scale = target_w / logo.width
    target_h = int(logo.height * scale)
    logo = logo.resize((target_w, target_h), Image.LANCZOS)

    # 5. Drop-shadows matching CSS:
    #    drop-shadow(0 12px 28px rgba(0,0,0,0.55))
    #  + drop-shadow(0 4px 12px rgba(212,175,55,0.18))
    def _shadow(alpha_src: Image.Image, rgb: tuple[int, int, int],
                opacity: float, dy: int, blur: int) -> Image.Image:
        # Create a canvas the same size as the full splash with an
        # opaque-colored silhouette of the logo alpha, blur it, offset
        # it, return it as an RGBA layer.
        layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        # silhouette: same shape as logo alpha, filled with `rgb`.
        silhouette = Image.new("RGBA", alpha_src.size, rgb + (0,))
        silhouette.putalpha(alpha_src.getchannel("A").point(lambda a: int(a * opacity)))
        cx = (SIZE - alpha_src.width) // 2
        cy = (SIZE - alpha_src.height) // 2 + dy
        layer.paste(silhouette, (cx, cy), silhouette)
        return layer.filter(ImageFilter.GaussianBlur(radius=blur))

    dark_shadow = _shadow(logo, (0, 0, 0), 0.55, dy=int(SIZE * 0.012), blur=int(SIZE * 0.028))
    gold_shadow = _shadow(logo, (212, 175, 55), 0.18, dy=int(SIZE * 0.004), blur=int(SIZE * 0.012))
    canvas = Image.alpha_composite(canvas, dark_shadow)
    canvas = Image.alpha_composite(canvas, gold_shadow)

    # 6. Finally, paint the logo itself, centered.
    logo_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    cx = (SIZE - logo.width) // 2
    cy = (SIZE - logo.height) // 2
    logo_layer.paste(logo, (cx, cy), logo)
    canvas = Image.alpha_composite(canvas, logo_layer)

    return canvas.convert("RGB")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img = build()
    for name in OUT_FILES:
        out = OUT_DIR / name
        img.save(out, format="PNG", optimize=True)
        size_kb = out.stat().st_size // 1024
        print(f"✓ wrote {out} ({size_kb} KB, {img.size[0]}×{img.size[1]})")


if __name__ == "__main__":
    main()
