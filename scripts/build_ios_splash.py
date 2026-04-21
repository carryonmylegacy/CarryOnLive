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

# Portrait PWA splash — single image used by all iOS `apple-touch-startup-image`
# media queries. 1290×2796 is iPhone 15 Pro Max native resolution; iOS scales
# it down smoothly for smaller screens, so one file covers every model.
PWA_SPLASH_W = 1290
PWA_SPLASH_H = 2796
PWA_OUT = ROOT / "public" / "apple-splash.png"


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


def build_rect(width: int, height: int, logo_width_frac: float = 0.52) -> Image.Image:
    """Build the flag-hero + floating-logo composite at an arbitrary
    rectangular size. Used for the square native launch image AND the
    tall portrait PWA apple-touch-startup-image."""
    canvas = Image.new("RGB", (width, height), BG_RGB)
    side = max(width, height)

    # Flag — scale cover to the larger dimension, center-crop.
    flag = Image.open(FLAG).convert("RGB")
    fw, fh = flag.size
    scale = max(width / fw, height / fh)
    nw, nh = int(fw * scale + 0.5), int(fh * scale + 0.5)
    flag = flag.resize((nw, nh), Image.LANCZOS)
    flag = flag.crop(((nw - width) // 2, (nh - height) // 2,
                     (nw - width) // 2 + width, (nh - height) // 2 + height))
    flag = ImageEnhance.Brightness(flag).enhance(1.45)
    flag = ImageEnhance.Contrast(flag).enhance(1.10)
    flag = ImageEnhance.Color(flag).enhance(1.35)
    flag_rgba = flag.convert("RGBA")
    flag_rgba.putalpha(int(255 * 0.95))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), flag_rgba)

    # Same four atmospheric overlays used on the square version, scaled
    # to this aspect ratio.
    def rgrad(cx, cy, rx, ry, color):
        yy, xx = np.meshgrid(
            np.arange(height, dtype=np.float32),
            np.arange(width, dtype=np.float32),
            indexing="ij",
        )
        d = ((xx - cx * width) / (rx * width)) ** 2 + ((yy - cy * height) / (ry * height)) ** 2
        a = np.clip(1.0 - d, 0.0, 1.0)
        a = (a * color[3]).astype(np.uint8)
        rgb = np.stack([
            np.full_like(a, color[0]),
            np.full_like(a, color[1]),
            np.full_like(a, color[2]),
        ], axis=-1).astype(np.uint8)
        return Image.fromarray(np.dstack([rgb, a]), mode="RGBA")

    for ov in [
        # Subtle dark fade at the very bottom only (was full-canvas radial
        # that washed out the flag — dropped ry from 1.0 → 0.35).
        rgrad(0.5, 1.05, 0.9, 0.35, (14, 24, 41, int(255 * 0.35))),
        # Light haze in upper-left area for depth (unchanged — small).
        rgrad(0.20, 0.80, 0.90, 0.40, (255, 255, 255, int(255 * 0.08))),
        rgrad(0.85, 0.85, 0.80, 0.35, (255, 255, 255, int(255 * 0.10))),
        # Tiny warm gold glow behind logo.
        rgrad(0.50, 0.50, 0.55, 0.35, (212, 175, 55, int(255 * 0.06))),
    ]:
        canvas = Image.alpha_composite(canvas, ov)

    # Logo centered. On tall portrait aspect ratios we want it slightly
    # smaller so it doesn't dominate the screen.
    logo = Image.open(LOGO).convert("RGBA")
    target_w = int(width * logo_width_frac)
    scale = target_w / logo.width
    logo = logo.resize((target_w, int(logo.height * scale)), Image.LANCZOS)

    # Same two-layer drop-shadow (dark 55 % + gold 18 %) as the CSS.
    def shadow(src, rgb, opacity, dy, blur):
        layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        sil = Image.new("RGBA", src.size, rgb + (0,))
        sil.putalpha(src.getchannel("A").point(lambda a: int(a * opacity)))
        cx = (width - src.width) // 2
        cy = (height - src.height) // 2 + dy
        layer.paste(sil, (cx, cy), sil)
        return layer.filter(ImageFilter.GaussianBlur(radius=blur))

    canvas = Image.alpha_composite(canvas, shadow(logo, (0, 0, 0), 0.55, int(side * 0.012), int(side * 0.028)))
    canvas = Image.alpha_composite(canvas, shadow(logo, (212, 175, 55), 0.18, int(side * 0.004), int(side * 0.012)))

    logo_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    logo_layer.paste(logo, ((width - logo.width) // 2, (height - logo.height) // 2), logo)
    canvas = Image.alpha_composite(canvas, logo_layer)
    return canvas.convert("RGB")


def build() -> Image.Image:
    """Backward-compat wrapper — square composite at SIZE × SIZE."""
    return build_rect(SIZE, SIZE, logo_width_frac=0.42)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # 1. Native iOS launch screen (square).
    square = build()
    for name in OUT_FILES:
        out = OUT_DIR / name
        square.save(out, format="PNG", optimize=True)
        size_kb = out.stat().st_size // 1024
        print(f"✓ wrote {out} ({size_kb} KB, {square.size[0]}×{square.size[1]})")

    # 2. PWA apple-touch-startup-image (portrait 1290×2796). Covers every
    #    iPhone model because iOS scales it — this is what the home-screen
    #    PWA launch uses BEFORE index.html starts rendering, which is the
    #    exact moment the user reported the old logo flashing.
    PWA_OUT.parent.mkdir(parents=True, exist_ok=True)
    portrait = build_rect(PWA_SPLASH_W, PWA_SPLASH_H, logo_width_frac=0.52)
    portrait.save(PWA_OUT, format="PNG", optimize=True)
    size_kb = PWA_OUT.stat().st_size // 1024
    print(f"✓ wrote {PWA_OUT} ({size_kb} KB, {portrait.size[0]}×{portrait.size[1]})")


if __name__ == "__main__":
    main()
