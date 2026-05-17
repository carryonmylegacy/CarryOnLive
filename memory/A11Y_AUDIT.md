# CarryOn™ — WCAG 2.1 AA Audit Report (2026-05-17 18:28 UTC)

Generated automatically from `axe-core` 4.x via Playwright. Re-runs every push that opts into `HK_RUN_A11Y=1`.

## TL;DR

- **Pages tested**: 2
- **Rules passed (cumulative)**: 40
- **Violations**: 0 total
  - 🔴 critical: 0
  - 🟠 serious: 0
  - 🟡 moderate: 0
  - 🟢 minor: 0

✅ **No critical or serious WCAG 2.1 AA violations.** The platform meets the procurement-grade bar.

## Per-page results

### `landing` — http://localhost:3000/

✅ Clean. No WCAG 2.1 AA violations.

### `login` — http://localhost:3000/login

✅ Clean. No WCAG 2.1 AA violations.

## Waivers

See `/app/memory/A11Y_WAIVERS.md` for any rules deliberately disabled, with rationale.

## Methodology

- Tool: `@axe-core/playwright` 4.x
- Tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`
- Browser: Chromium (Playwright default)
- We test the highest-traffic surfaces (landing, login, dashboard). Add new pages to `tests/e2e/a11y.spec.js`.
