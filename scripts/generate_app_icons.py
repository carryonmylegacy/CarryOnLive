#!/usr/bin/env python3
"""CarryOn™ — App icon generator.

Turns a single source logo (any size, JPG/PNG/WebP) into the full set of
PWA / iOS / Android / macOS icons the app ships. Guarantees:

- Every edge pixel is SOLID navy (#0B1221, matching CSS `--bg`). This is
  what fixes the macOS-Dock "white border sides" artifact we saw when a
  gradient-background source JPG was used directly.
- `any`-purpose icons place the artwork at 92% of canvas (subtle breathing
  room so the Dock's rounded-rect mask has clean edges).
- `maskable`-purpose icons place the artwork at 72% of canvas (14% safe
  ring on every side so Android adaptive-icon masks — circle, squircle,
  rounded-square, teardrop — never crop the hands or infinity symbol).
- Corner pixels are verified after generation; the script fails loudly
  if any edge isn't uniform.

Usage:
  python scripts/generate_app_icons.py /path/to/source-logo.jpg
  python scripts/generate_app_icons.py /path/to/logo.png --navy "#0B1221"

Outputs (into /app/frontend/public/):
  carryon-app-icon-square-192.png        192×192  any
  carryon-app-icon-square-512.png        512×512  any
  carryon-app-icon-square.png            512×512  any (legacy filename)
  app-icon-1024.png                     1024×1024 any (macOS master)
  icon-192.png                           192×192  any (back-compat)
  icon-512.png                           512×512  any (back-compat)
  carryon-app-icon-maskable-192.png      192×192  maskable
  carryon-app-icon-maskable-512.png      512×512  maskable

  apple-touch-icon-120.png               120×120  any (iPhone @2x)
  apple-touch-icon-152.png               152×152  any (iPad @2x)
  apple-touch-icon-167.png               167×167  any (iPad Pro)
  apple-touch-icon-180.png               180×180  any (iPhone @3x / macOS Safari notif)
  apple-touch-icon.png                   180×180  any (default fallback)
  notification-icon-64.png                64×64   any (small web-push glyph)
  notification-icon-128.png              128×128  any (web-push @2x)
  notification-badge-72.png               72×72   mono (Android tray badge @xxhdpi)
  notification-badge-96.png               96×96   mono (Android tray badge @xxxhdpi)
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.stderr.write('Pillow is required: pip install Pillow\n')
    sys.exit(2)

REPO_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = REPO_ROOT / 'frontend' / 'public'

# Inner crop fraction — how much of the source to keep before compositing.
# 0.88 drops ~6% from each edge, which is where gradient/fade usually lives.
SOURCE_CROP_FRAC = 0.88

# Color-key thresholds for detecting the gold artwork vs the source
# background. The source has a light-blue vignette that leaks into the
# final icons as visible bands if we don't flatten it. We detect the
# gold artwork as pixels where red > blue by a margin AND luminance is
# bright — this cleanly separates the warm-tone artwork from any shade
# of blue-gray.
GOLD_MIN_LUMA = 100          # on a 0-255 scale; gold ≈ 170, blue-gray ≤ 140
GOLD_MIN_R_MINUS_B = 20      # gold has red >> blue; blue-gray has red < blue

# Artwork-on-canvas scale per purpose.
ANY_SCALE = 0.92       # tiny breathing room around the logo
MASKABLE_SCALE = 0.72  # 14% safe ring on each side for Android masks


def hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    s = hex_str.lstrip('#')
    if len(s) != 6:
        raise ValueError(f'Expected a 6-digit hex color, got: {hex_str!r}')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _gold_mask(src: Image.Image) -> Image.Image:
    """Build an L-mode mask (255 = artwork, 0 = background) for the source.

    Uses a color-key test: warm-tone (R - B >= 20) AND bright enough
    (luma >= 100). This correctly keeps the gold infinity symbol and
    rejects every shade of navy/blue/gray in the source's vignette.
    """
    src = src.convert('RGB')
    r, _, b = src.split()
    luma = src.convert('L')
    r_px, b_px, luma_px = r.load(), b.load(), luma.load()
    w, h = src.size
    out = Image.new('L', src.size, 0)
    out_px = out.load()
    for y in range(h):
        for x in range(w):
            if luma_px[x, y] >= GOLD_MIN_LUMA and (r_px[x, y] - b_px[x, y]) >= GOLD_MIN_R_MINUS_B:
                out_px[x, y] = 255
    return out


def extract_artwork(src_path: Path, bg: tuple[int, int, int]) -> Image.Image:
    """Load the source and flatten any non-gold pixel to pure `bg`.

    The source has a light-blue radial vignette (top corners ≈
    rgb(146,172,223)) that bleeds into icons as visible bands at small
    display sizes. We keep only the gold artwork and replace everything
    else — navy, vignette, and all — with pure `bg`.
    """
    src = Image.open(src_path).convert('RGB')
    mask = _gold_mask(src)

    # Also keep the light-blue HAND line-art so the full logo survives.
    # Hand lines are ~rgb(146,172,223) — brighter than navy but NOT
    # warm. We include pixels that are clearly *not* the dark navy
    # background: luma > 90 AND blue dominates (B >= R).
    r, _, b = src.convert('RGB').split()
    luma = src.convert('L')
    r_px, b_px, luma_px = r.load(), b.load(), luma.load()
    w, h = src.size
    mask_px = mask.load()
    for y in range(h):
        for x in range(w):
            if luma_px[x, y] >= 130 and b_px[x, y] > r_px[x, y] + 20:
                mask_px[x, y] = 255

    flat = Image.new('RGB', src.size, bg)
    flat.paste(src, (0, 0), mask=mask)
    return flat


def build_mono_badge(src_path: Path, size: int,
                     luma_threshold: int = 100,
                     inner_scale: float = 0.80) -> Image.Image:
    """Render a white-on-transparent silhouette of the source artwork.

    Android's notification tray strips color from the `badge` image and
    re-tints it with the system accent, so a flat silhouette reads far
    sharper than the auto-flattened full-color logo. We threshold the
    source's luminance (gold artwork ~175 vs navy bg ~16), tight-crop to
    the artwork's bbox, and center it on a transparent canvas.
    """
    artwork = extract_artwork(src_path, (11, 18, 33))
    gray = artwork.convert('L')
    mask = gray.point(lambda p: 255 if p > luma_threshold else 0)
    bbox = mask.getbbox()
    if bbox:
        mask = mask.crop(bbox)

    # White pixels wherever the mask is non-zero, transparent elsewhere.
    silhouette = Image.new('RGBA', mask.size, (255, 255, 255, 0))
    silhouette.putalpha(mask)

    # Fit the silhouette into `inner_scale` of the target canvas while
    # preserving its aspect ratio.
    target_inner = int(size * inner_scale)
    sw, sh = silhouette.size
    scale = min(target_inner / sw, target_inner / sh)
    new_w, new_h = max(1, int(sw * scale)), max(1, int(sh * scale))
    resized = silhouette.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    pos = ((size - new_w) // 2, (size - new_h) // 2)
    canvas.paste(resized, pos, resized)
    return canvas


def composite(artwork: Image.Image, size: int, scale: float,
              bg: tuple[int, int, int]) -> Image.Image:
    """Scale the artwork and paste it centered on a solid `bg` canvas."""
    inner_size = int(size * scale)
    inner = artwork.resize((inner_size, inner_size), Image.LANCZOS)
    canvas = Image.new('RGB', (size, size), bg)
    pos = ((size - inner_size) // 2, (size - inner_size) // 2)
    canvas.paste(inner, pos)
    return canvas


def verify_edges(path: Path, expected: tuple[int, int, int]) -> None:
    """Sample 4 corners + top/bottom mids + left/right mids; raise if any
    pixel differs from `expected`.

    Samples at 1px offset from each edge so this works for icons as small
    as 16px (where deeper sampling would land on artwork for small
    `ANY_SCALE` values).
    """
    im = Image.open(path)
    w, h = im.size
    samples = [
        im.getpixel((1, 1)), im.getpixel((w - 2, 1)),
        im.getpixel((1, h - 2)), im.getpixel((w - 2, h - 2)),
        im.getpixel((w // 2, 1)), im.getpixel((w // 2, h - 2)),
        im.getpixel((1, h // 2)), im.getpixel((w - 2, h // 2)),
    ]
    bad = [s for s in samples if s != expected]
    if bad:
        raise RuntimeError(
            f'edge verification FAILED for {path}: '
            f'expected {expected}, got {set(samples)}'
        )


def generate(src_path: Path, navy: tuple[int, int, int]) -> None:
    if not src_path.exists():
        sys.stderr.write(f'Source not found: {src_path}\n')
        sys.exit(1)
    if not PUBLIC_DIR.exists():
        sys.stderr.write(f'Public dir not found: {PUBLIC_DIR}\n')
        sys.exit(1)

    artwork = extract_artwork(src_path, navy)

    any_outputs = [
        (192, 'carryon-app-icon-square-192.png'),
        (512, 'carryon-app-icon-square-512.png'),
        (512, 'carryon-app-icon-square.png'),
        (1024, 'app-icon-1024.png'),
        (192, 'icon-192.png'),
        (512, 'icon-512.png'),
        # Apple-touch-icon family — covers all iOS/iPadOS/macOS Safari home-screen
        # and notification-toast sizes. Declaring explicit sizes prevents Safari
        # from downscaling the 512 master to ~64px with heavy aliasing in the
        # macOS notification permission toast.
        (120, 'apple-touch-icon-120.png'),
        (152, 'apple-touch-icon-152.png'),
        (167, 'apple-touch-icon-167.png'),
        (180, 'apple-touch-icon-180.png'),
        (180, 'apple-touch-icon.png'),
        # Dedicated small-size icons for the service-worker `showNotification`
        # `icon` parameter (rendered ~48-64px in system toasts).
        (64, 'notification-icon-64.png'),
        (128, 'notification-icon-128.png'),
    ]
    maskable_outputs = [
        (192, 'carryon-app-icon-maskable-192.png'),
        (512, 'carryon-app-icon-maskable-512.png'),
    ]

    # Monochrome badges — white silhouette on transparent background.
    # Android's notification tray strips color and re-tints; a flat
    # silhouette reads far sharper than a flattened full-color logo.
    mono_outputs = [
        (72, 'notification-badge-72.png'),
        (96, 'notification-badge-96.png'),
    ]

    for size, name in any_outputs:
        out = PUBLIC_DIR / name
        composite(artwork, size, ANY_SCALE, navy).save(out, 'PNG', optimize=True)
        verify_edges(out, navy)
        print(f'PASS  {name:40s}  {size}x{size}  any')

    for size, name in maskable_outputs:
        out = PUBLIC_DIR / name
        composite(artwork, size, MASKABLE_SCALE, navy).save(out, 'PNG', optimize=True)
        verify_edges(out, navy)
        print(f'PASS  {name:40s}  {size}x{size}  maskable')

    for size, name in mono_outputs:
        out = PUBLIC_DIR / name
        badge = build_mono_badge(src_path, size)
        badge.save(out, 'PNG', optimize=True)
        # Transparent-corner check: alpha at (1,1) must be 0.
        im = Image.open(out)
        alpha_corner = im.getpixel((1, 1))[3]
        if alpha_corner != 0:
            raise RuntimeError(
                f'mono-badge corner not transparent for {out}: alpha={alpha_corner}'
            )
        print(f'PASS  {name:40s}  {size}x{size}  mono')

    total = len(any_outputs) + len(maskable_outputs) + len(mono_outputs)
    print(f'\nAll {total} icons generated + verified.')


def main() -> None:
    ap = argparse.ArgumentParser(description='Generate CarryOn app icons from a source logo.')
    ap.add_argument('source', type=Path, help='Path to source logo (JPG/PNG/WebP)')
    ap.add_argument(
        '--navy', default='#0B1221',
        help='Background hex color — must match CSS --bg (default: #0B1221)',
    )
    args = ap.parse_args()
    generate(args.source, hex_to_rgb(args.navy))


if __name__ == '__main__':
    main()
