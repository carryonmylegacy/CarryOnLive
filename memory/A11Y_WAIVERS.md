# CarryOn™ — A11Y Waivers (WCAG 2.1 AA)

Rules deliberately disabled in `tests/e2e/a11y.spec.js`, with rationale.

**Goal**: keep this list as short as possible — every waiver is a procurement question we have to defend in writing.

| Rule | Reason for waiver | Reviewed by | Date |
|---|---|---|---|
| `meta-viewport` (page-wide) | iOS PWA standalone mode requires `maximum-scale=1, user-scalable=no` to prevent the iOS double-tap-zoom gesture from breaking custom touch handlers (tile grids + org-chart canvas). Trade-off accepted because (a) iOS users can still use system Accessibility > Zoom, (b) all typography is 16px+, (c) alternative breaks production PWA. | E1 / pitch agent | 2026-02-12 |
| YouTube iframe scope | Third-party iframe (`iframe[src*=youtube.com]`) injects its own DOM we cannot modify. axe rules fire inside the embedded player (`aria-prohibited-attr`, `button-name`, `color-contrast`). Excluded via `AxeBuilder.exclude()`, NOT via `disableRules` — so violations OUTSIDE the iframe still fail. | E1 / pitch agent | 2026-02-12 |

If a rule starts firing across many pages and you need to ship before fixing root cause, add it here with a real reason — never just to make the test green.
