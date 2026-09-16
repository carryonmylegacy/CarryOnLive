# Product screenshots used on the marketing pages

Real screenshots of CarryOn captured from the LIVE production site (https://www.carryon.us)
using the demonstration account `petemitchell`. Rendered by
`src/components/landing/ProductPreview.js`.

| File | Viewport | Shown on |
|------|----------|----------|
| `dashboard.webp`, `vault.webp`, `contacts.webp`, `checklist.webp` | 1440×900 @2x → 2160×1350 | ≥ 768px (browser frame) |
| `m-dashboard.webp`, `m-vault.webp`, `m-contacts.webp`, `m-checklist.webp` | iPhone 14 390×664 @2x → 780×1328 | < 768px (phone frame) |

`contacts` = `/beneficiaries` page ("Who to call first" tab). `checklist` = `/checklist` with the
"Critical – Do Immediately" group expanded.

## Regenerate
```bash
SHOT_USER=petemitchell SHOT_PASS='<see /app/memory/test_credentials.md>' /opt/plugins-venv/bin/python /app/scripts/capture_product_screenshots.py
SHOT_MODE=mobile SHOT_USER=petemitchell SHOT_PASS='…' /opt/plugins-venv/bin/python /app/scripts/capture_product_screenshots.py
```
The script hides only account-specific nudges (onboarding wizard, push prompt, "Section Unlocked"
banners) before shooting. Nothing else is edited — keep it that way; the site says
"Nothing mocked up."
