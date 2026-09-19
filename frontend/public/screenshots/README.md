# Product screenshots used on the marketing pages

Real screenshots of CarryOn captured from the LIVE production site (https://www.carryon.us)
using the demonstration account `petemitchell`. Rendered by
`src/components/landing/ProductPreview.js`, `HeroShot.js` and `StepsShowcase.js`.

Last captured: **Sep 19, 2026** (current People / Access / Money / Action build; Total Family
Continuity 72%, 10 beneficiaries, 7 documents, 59-item IAC).

| File | Viewport | Shown on |
|------|----------|----------|
| `dashboard.webp`, `vault.webp`, `contacts.webp`, `checklist.webp` | 1440×900 @2x → 2160×1350 | ≥ 768px (browser frame) |
| `m-dashboard.webp`, `m-vault.webp`, `m-contacts.webp`, `m-checklist.webp` | iPhone 14 390×664 @2x → 780×1328 | < 768px (phone frame) |

`contacts` = `/beneficiaries` page ("Who to call first" tab). `checklist` = `/checklist` with the
"Critical – Do Immediately" group expanded.

## Regenerate (whenever the demo account or the product UI changes)
```bash
SHOT_USER=petemitchell SHOT_PASS='<see /app/memory/test_credentials.md>' /opt/plugins-venv/bin/python /app/scripts/capture_product_screenshots.py
SHOT_MODE=mobile SHOT_USER=petemitchell SHOT_PASS='…' /opt/plugins-venv/bin/python /app/scripts/capture_product_screenshots.py
```
The script hides only account-specific nudges (QuickStart modal, onboarding wizard / action-item
group, push prompt, "Section Unlocked" banners) before shooting. Nothing else is edited — keep it
that way; the site says "Nothing mocked up." If the dashboard alt text in `ProductPreview.js` /
`HeroShot.js` quotes a score, update it to match the new capture.
