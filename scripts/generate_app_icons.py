#!/usr/bin/env python3
"""CarryOn™ — App icon generator (v3, Apr 24 2026).

Turns a single pre-finished square logo image (any size, JPG/PNG/WebP)
into the full set of PWA / iOS / Android / macOS icons the app ships.

### Design
This version is intentionally simple:

- **Source-faithful.** We treat the uploaded image as the final icon
  artwork and just resize it to each target size with high-quality
  LANCZOS interpolation. No color-keying, no artwork-extraction, no
  gradient flattening — those were heuristics that stripped the
  light-blue hand line-art and the outer rounded-rect frame from the
  user's current master, producing the "too dark" look reported Apr 24.
- **Maskable variant** pastes the source at 72% of canvas on a solid
  navy (`#0B1221`) background, giving Android's adaptive-icon masks
  (circle, squircle, rounded-square, teardrop) a generous 14% safe
  ring so the hands + infinity never get cropped.
- **Mono badge** is generated purely from the source luminance so the
  Android notification tray can re-tint it.

Usage:
    python scripts/generate_app_icons.py /path/to/Logo_for_App_Icon.jpg
    python scripts/generate_app_icons.py /path/to/logo.png --navy "#0B1221"
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.stderr.write('Pillow is required: pip install Pillow\n')
    sys.exit(2)

REPO_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = REPO_ROOT / 'frontend' / 'public'

# Artwork-on-canvas scale for Android maskable variant.
MASKABLE_SCALE = 0.72


def hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    s = hex_str.lstrip('#')
    if len(s) != 6:
        raise ValueError(f'Expected a 6-digit hex color, got: {hex_str!r}')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def load_square(src_path: Path) -> Image.Image:
    """Load the source and ensure it's a perfect square (center-crop if not).
    Keeps the image RGB — we want every color (gradient, frame, hands)
    preserved as-is through to the final icons.
    """
    src = Image.open(src_path).convert('RGB')
    w, h = src.size
    if w != h:
        short = min(w, h)
        left = (w - short) // 2
        top = (h - short) // 2
        src = src.crop((left, top, left + short, top + short))
    return src


def resize_any(src: Image.Image, size: int) -> Image.Image:
    """Produce an `any`-purpose icon: the full source resized to `size`."""
    return src.resize((size, size), Image.LANCZOS)


def resize_maskable(src: Image.Image, size: int,
                    bg: tuple[int, int, int]) -> Image.Image:
    """Produce a maskable icon: source at 72% on a solid-navy canvas."""
    inner = int(size * MASKABLE_SCALE)
    small = src.resize((inner, inner), Image.LANCZOS)
    canvas = Image.new('RGB', (size, size), bg)
    pos = ((size - inner) // 2, (size - inner) // 2)
    canvas.paste(small, pos)
    return canvas


def build_mono_badge(src: Image.Image, size: int,
                     luma_threshold: int = 140,
                     inner_scale: float = 0.80) -> Image.Image:
    """Render a white-on-transparent silhouette of the source artwork.

    Thresholds the source's luminance so only the bright artwork (gold
    infinity + bright-blue hand outlines) survives, then centers the
    silhouette on a transparent canvas. Android's notification tray
    strips color and re-tints with the system accent — so a flat
    silhouette reads far sharper than a shrunken full-color logo.
    """
    gray = src.convert('L')
    mask = gray.point(lambda p: 255 if p > luma_threshold else 0)
    bbox = mask.getbbox()
    if bbox:
        mask = mask.crop(bbox)

    silhouette = Image.new('RGBA', mask.size, (255, 255, 255, 0))
    silhouette.putalpha(mask)

    target_inner = int(size * inner_scale)
    sw, sh = silhouette.size
    scale = min(target_inner / sw, target_inner / sh)
    new_w, new_h = max(1, int(sw * scale)), max(1, int(sh * scale))
    resized = silhouette.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    pos = ((size - new_w) // 2, (size - new_h) // 2)
    canvas.paste(resized, pos, resized)
    return canvas


def generate(src_path: Path, navy: tuple[int, int, int]) -> None:
    if not src_path.exists():
        sys.stderr.write(f'Source not found: {src_path}\n')
        sys.exit(1)
    if not PUBLIC_DIR.exists():
        sys.stderr.write(f'Public dir not found: {PUBLIC_DIR}\n')
        sys.exit(1)

    src = load_square(src_path)

    any_outputs = [
        (192, 'carryon-app-icon-square-192.png'),
        (512, 'carryon-app-icon-square-512.png'),
        (512, 'carryon-app-icon-square.png'),
        (1024, 'app-icon-1024.png'),
        (192, 'icon-192.png'),
        (512, 'icon-512.png'),
        # Apple-touch-icon family — covers all iOS/iPadOS/macOS Safari
        # home-screen and notification-toast sizes.
        (120, 'apple-touch-icon-120.png'),
        (152, 'apple-touch-icon-152.png'),
        (167, 'apple-touch-icon-167.png'),
        (180, 'apple-touch-icon-180.png'),
        (180, 'apple-touch-icon.png'),
        # Dedicated small-size icons for the service-worker showNotification
        # `icon` parameter (rendered ~48-64px in system toasts).
        (64, 'notification-icon-64.png'),
        (128, 'notification-icon-128.png'),
    ]
    maskable_outputs = [
        (192, 'carryon-app-icon-maskable-192.png'),
        (512, 'carryon-app-icon-maskable-512.png'),
    ]
    # Monochrome badges — white silhouette on transparent background.
    mono_outputs = [
        (72, 'notification-badge-72.png'),
        (96, 'notification-badge-96.png'),
    ]

    for size, name in any_outputs:
        out = PUBLIC_DIR / name
        resize_any(src, size).save(out, 'PNG', optimize=True)
        print(f'PASS  {name:40s}  {size}x{size}  any')

    for size, name in maskable_outputs:
        out = PUBLIC_DIR / name
        resize_maskable(src, size, navy).save(out, 'PNG', optimize=True)
        print(f'PASS  {name:40s}  {size}x{size}  maskable')

    for size, name in mono_outputs:
        out = PUBLIC_DIR / name
        badge = build_mono_badge(src, size)
        badge.save(out, 'PNG', optimize=True)
        im = Image.open(out)
        alpha_corner = im.getpixel((1, 1))[3]
        if alpha_corner != 0:
            raise RuntimeError(
                f'mono-badge corner not transparent for {out}: alpha={alpha_corner}'
            )
        print(f'PASS  {name:40s}  {size}x{size}  mono')

    total = len(any_outputs) + len(maskable_outputs) + len(mono_outputs)
    print(f'\nAll {total} icons generated.')


def main() -> None:
    ap = argparse.ArgumentParser(description='Generate CarryOn app icons from a source logo.')
    ap.add_argument('source', type=Path, help='Path to source logo (JPG/PNG/WebP)')
    ap.add_argument(
        '--navy', default='#0B1221',
        help='Background hex for maskable padding — must match CSS --bg (default: #0B1221)',
    )
    args = ap.parse_args()
    generate(args.source, hex_to_rgb(args.navy))


if __name__ == '__main__':
    main()
