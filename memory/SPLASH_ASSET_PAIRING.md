# CarryOn Splash Asset Pairing

The web boot splash and the native iOS launch screen **MUST use the same
artwork** to guarantee pixel-for-pixel parity across PWA installs,
home-screen icons, TestFlight, and App Store builds. A past agent shipped
a "JV" variant (generic shield SVG + marketing copy) and the user
rightly flagged it as inconsistent with the native launch.

## Paired files (keep in sync)

| Surface | Path | Size | Notes |
|---------|------|------|-------|
| Native iOS launch | `/app/frontend/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png` | 2732×2732 | Source of truth. Referenced by `LaunchScreen.storyboard` with `scaleAspectFill`. |
| Web boot splash | `/app/frontend/public/splash.jpg` | 1024×1024 (~29 KB) | Downscaled from the iOS source with Pillow + JPEG q88. Referenced by `index.html` inline splash. |
| Web boot splash (PNG fallback) | `/app/frontend/public/splash.png` | 1024×1024 | Same pixels, lossless. Not currently referenced but kept for future use. |

## Background color (match exactly)

- iOS storyboard: `backgroundColor` sRGB `(0.058823, 0.086274, 0.160784, 1)`
- Web splash: `#0F1629` (equivalent hex)
- Any future edit to one MUST update the other.

## How to regenerate the web assets from the iOS source

```bash
python3 <<'PY'
from PIL import Image
src = Image.open('/app/frontend/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png')
web = src.resize((1024, 1024), Image.LANCZOS)
web.save('/app/frontend/public/splash.png', 'PNG', optimize=True)
web.convert('RGB').save('/app/frontend/public/splash.jpg', 'JPEG', quality=88, optimize=True, progressive=True)
PY
```

## How to regenerate the iOS source from a new brand file

If the user ships a new brand mark:
1. Save the new artwork at 2732×2732 PNG to all three iOS filenames:
   - `splash-2732x2732.png`
   - `splash-2732x2732-1.png`
   - `splash-2732x2732-2.png`
2. Run the Pillow snippet above to regenerate `splash.jpg` + `splash.png`.
3. Run `bash /app/housekeeping.sh` to confirm no drift.
4. Update Capacitor: `cd /app/frontend && npx cap copy ios` (rebuild launch screen asset catalog).

## Do not

- Do not invent an alternative splash layout on the web.
- Do not add marketing copy ("Loading your vault…" etc.) to either surface.
- Do not use a different accent or background color than `#0F1629`.
- Do not use SVG approximations of the logo — always use the rasterized brand file.
