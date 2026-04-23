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

# Artwork-on-canvas scale per purpose.
ANY_SCALE = 0.92       # tiny breathing room around the logo
MASKABLE_SCALE = 0.72  # 14% safe ring on each side for Android masks


def hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    s = hex_str.lstrip('#')
    if len(s) != 6:
        raise ValueError(f'Expected a 6-digit hex color, got: {hex_str!r}')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def extract_artwork(src_path: Path) -> Image.Image:
    """Load the source, crop the gradient-fade edges, return the artwork."""
    src = Image.open(src_path).convert('RGB')
    w, h = src.size
    cw, ch = int(w * SOURCE_CROP_FRAC), int(h * SOURCE_CROP_FRAC)
    left, top = (w - cw) // 2, (h - ch) // 2
    return src.crop((left, top, left + cw, top + ch))


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

    artwork = extract_artwork(src_path)

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

    print(f'\nAll {len(any_outputs) + len(maskable_outputs)} icons generated + verified.')


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
