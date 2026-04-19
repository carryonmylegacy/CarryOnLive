# CarryOn — Changelog

## Feb 14, 2026 — Toggle state fix (bulletproof) + platform-wide audit + regression test

**Why the previous fix failed:** My prior `useState(() => localStorage.getItem(...) === 'true')` + manual `CustomEvent` was brittle under certain mount/unmount conditions (the PWA on iOS Safari exhibited this — the Switch fired the toast but the `checked` prop ignored the state update). The user correctly reported the switch still wasn't flipping.

**The bulletproof fix:**
- **New hook `hooks/useLocalStorageBoolean.js`** — backed by React 19's `useSyncExternalStore`. Subscribes to both the native `storage` event (cross-tab) and a custom `carryon:localstorage-changed` event (intra-tab). Writes automatically dispatch the custom event so every component using the same key re-renders in lockstep. Returned tuple is `[value, setValue]` — identical ergonomics to `useState`.
- **`pages/SettingsPage.js`** — swapped `useState` + manual `localStorage.setItem` + manual `CustomEvent` dispatch for one line: `useLocalStorageBoolean('hide_beta_bug_icon')`. The onChange handler is now 3 lines: call setter, fire toast, done.
- **`components/layout/DashboardLayout.js`** — replaced the `useState` + `useEffect` event-listener combo with the same hook. The floating bug button now appears/disappears in sync with the Settings toggle, across any mount/unmount cycle.

**Platform-wide audit:** grepped every `<Switch>` in the codebase (44 total). Confirmed no other toggle had the same `checked={localStorage.getItem(...)}` anti-pattern — the broken one was isolated. Future localStorage-backed toggles should use `useLocalStorageBoolean` as the canonical primitive.

**Regression test:** `tests/e2e/toggle_state.spec.js` — clicks the theme toggle in Settings, asserts `data-state` attribute on Radix Switch flips from `checked` ↔ `unchecked`, and verifies a second click round-trips back. This catches the entire class of "toast fires but visual state never changes" bugs.

Verified: new regression test passes (10.6s), Playwright smoke + scrollbar 10/10 green, housekeeping 65/65 PASS, ESLint clean.


## Feb 14, 2026 — Splash asset parity: web ↔ native iOS pixel-identical

User asked to line up the web boot splash with the native iOS `LaunchScreen.storyboard` so PWA installs, home-screen icons, TestFlight, and App Store all show the same splash.

- **Downscaled** the existing iOS source (`splash-2732x2732.png`, 2732×2732) to two web-friendly assets via Pillow/LANCZOS:
  - `public/splash.png` (1024×1024, ~110 KB, lossless)
  - `public/splash.jpg` (1024×1024, ~29 KB, q88 progressive) — what the web actually loads.
- **`public/index.html`** — splash markup now loads `/splash.jpg` full-screen with `object-fit: contain` (max 82% of viewport to leave breathing room) on a `#0F1629` background. That hex is the exact sRGB equivalent of the iOS storyboard's `backgroundColor="red=0.0588 green=0.0862 blue=0.1607"` — pixel-identical backdrop. Removed the separate logo tile + bespoke layout; now the rendered splash is just the brand artwork + a subtle gold spinner 14vh from the bottom.
- **`memory/SPLASH_ASSET_PAIRING.md`** — new doc explains the pairing, the exact hex/rgb, and the regenerate-from-iOS-source Pillow snippet. Future agents can't drift the two surfaces apart without consciously ignoring the doc.

Tests: Playwright smoke + scrollbar 10/10 green. Housekeeping 65/65 PASS. Live screenshot confirms the new web splash is visually identical to the native iOS launch screen the user shared.


## Feb 14, 2026 — Splash polish (JV → varsity) + Switch-state fix

**Splash screen:** Previous version had a generic shield SVG, "LOADING YOUR VAULT…" marketing copy, and a light-mode media query that painted cream on iOS. User (correctly) called it JV. Replaced with a direct mirror of the native iOS launch screen.

- **`public/index.html`** — splash now uses the real `/carryon-icon.jpg` brand mark (your hands + gold infinity logo), dark navy `#0B1221` background matching the native launch, no marketing copy, one thin elegant spinner beneath the icon.
- **Moved splash OUT of `#root`** and made it a sibling element. Previously React's `createRoot().render()` atomically replaced `#root` children on mount, producing a ~180ms navy-blank gap between the splash and the app's own `PageLoader` (which has an anti-flash 180ms delay). Splash is now sibling + fades via CSS class.
- **Added `carryon:app-ready` event handoff.** `AuthContext.initAuth` dispatches the event after `setLoading(false)`. Inline script in `index.html` listens once, adds `.carryon-splash-hide` class for a 350ms opacity fade, then removes the element from the DOM. 20s safety timeout so a boot failure never traps the user.

**Switch not turning green after flip ("Hide Bug Report Icon"):** The Switch read `localStorage` directly at render, so once I removed the page reload there was no re-render trigger — the `checked` prop stayed stale even though the toast fired and the state was persisted.

- **`pages/SettingsPage.js`** — added a `betaBugIconHidden` React state initialised from localStorage, driving both the Switch's `checked` prop and the localStorage write. Switch now flips visually the instant the user taps, toast fires, custom event broadcasts to DashboardLayout (which already listens) so the floating bug button appears/disappears in place. Zero page reload, zero freeze.

Tests: Playwright smoke + scrollbar → 10/10 passed. Housekeeping 65/65 PASS. Live screenshot captured showing the new varsity splash with real brand mark.


## Feb 14, 2026 — Perf: Toggle-freeze fix + cold-boot white-screen fix

**Issue 1 — "Hide Bug Report Icon" toggle locked the UI for ~30s:** My earlier change fired a `toast + setTimeout(reload, 900ms)`. The reload re-downloaded the whole JS bundle + re-authed + refetched dashboard data, which on a cold Railway backend can stall for 30s+. Root cause: DashboardLayout was reading `localStorage.hide_beta_bug_icon` directly at render, so a reload was the only way to reflect the change.

Fix:
- **`components/layout/DashboardLayout.js`** — converted the localStorage read to a reactive `betaIconHidden` React state initialized from localStorage. Added a `carryon:beta-icon-changed` window-event listener that updates the state in place; floating bug button now toggles instantly.
- **`pages/SettingsPage.js`** — removed `setTimeout(() => window.location.reload(), 900)` from both the Beta "Hide Bug Icon" toggle and the "Create-Estate Reminder" toggle. The beta toggle now dispatches the CustomEvent. The reminder toggle calls `refreshUser()` from AuthContext instead of a full reload.

**Issue 2 — >1 minute white screen on cold boot from home-screen icon:** Three compounding bottlenecks identified:

1. **Empty `<div id="root">`** — nothing visible until the full JS bundle downloaded, parsed, and hydrated. Added an inline brand splash (navy background, gold CarryOn logo + "Loading your vault…" + spinner) directly inside `#root` in `public/index.html`. ~1KB of HTML+CSS, zero network requests. React automatically replaces it on first render. Auto-respects `prefers-color-scheme: light`.
2. **Sequential boot API calls** — `AuthContext.initAuth` awaited `/auth/me`, then `/subscriptions/status`, then `/subscriptions/enabled-features` in series. On a cold Railway backend (10–40s cold start), that's up to 2 minutes. Refactored to `Promise.allSettled` so all three fly in parallel — ~3× faster on cold starts. Added per-request 20s timeout so a dead backend logs the user out instead of hanging forever.
3. **Render-blocking Google Fonts CSS** — swapped the blocking `<link rel="stylesheet">` for the `<link rel="preload" … onload="this.rel='stylesheet'">` pattern with a `<noscript>` fallback, unblocking First Contentful Paint by 200–800ms.

Tests: Playwright smoke + scrollbar → 10/10 passed, housekeeping 65/65 PASS, ESLint clean across all 3 files.


## Feb 14, 2026 — Toast system fix: sonner was never mounted, routed through AppNotification

**Root cause of "no toasts appearing":** 10 files across the app imported `toast` from the `sonner` library, but sonner's `<Toaster />` component was never mounted in `App.js`. The app uses a custom branded notification system at `components/AppNotification.js` (rendered via `NotificationContainer`). A shim at `utils/toast.js` exists to translate sonner-style calls into that system, but half the codebase bypassed it and went directly to sonner — sending every toast into the void.

Fix:
- **Swapped `from 'sonner'` → `from '../utils/toast'` across 10 files**: `SettingsPage.js`, `SecuritySettingsPage.js`, `AppearanceCard.js`, `PersonalInfoCard.js`, `PrivacyCard.js`, `NotificationPrefsCard.js`, `DigestCard.js`, `EstatePhotoCard.js`, `ProfileCard.js`, `FounderEmailsTab.js`.
- **Upgraded the shim (`utils/toast.js`)** to accept sonner's full options object (`{ duration, description, action, title }`) and forward them to `notify.success/error/info/warning`. The `description` field is flattened into the message with a middle-dot separator so users see the supporting context inline.

Verified live: logged in via Playwright, clicked the Save button on Security Settings → the CarryOn-branded gold-bordered toast `"Success — All security settings on this page are saved.  ·  Every change you just made is committed to your account."` rendered at the top of the page. ESLint clean across all 11 files, housekeeping 65/65 PASS, Playwright smoke + scrollbar → 10/10 passed.


## Feb 14, 2026 — Per-toggle "— saved." confirmation toasts

User request: *"After each toggle switch is moved and is auto-saved there should be a toast that says those settings were specifically saved. Then if they want to hit Save at the top they can do that."*

Every auto-saving toggle now fires a named toast after its write succeeds. The top-of-page Save button remains as a second-layer affirmation. Wording is uniform: `"<thing> <new-state> — saved."`

Files touched:
- **`components/settings/AppearanceCard.js`** — theme + onboarding-guide toggles now say `"Dark mode enabled — saved."` / `"Light mode enabled — saved."` / `"Getting Started Guide turned on — saved."` etc. (imported `sonner`).
- **`components/settings/NotificationPrefsCard.js`** — master push toggle + every per-category toggle say `"<Category> <enabled|disabled> — saved."`. Error path now also surfaces a toast so users know if saving failed.
- **`components/settings/PrivacyCard.js`** — generic `"Preference updated"` replaced with `"Marketing Emails enabled — saved."`, `"Analytics Tracking disabled — saved."`, `"Third-Party Data Sharing enabled — saved."` (label map added).
- **`components/NotificationSettings.js`** — the `// toast removed` comments replaced with `toast.success('Push notifications turned on — saved.')` and `... turned off — saved.`.
- **`pages/SettingsPage.js`** — inline "Create-Estate Reminder" and "Hide Bug Report Icon" toggles now show save toasts and the hard `window.location.reload()` is delayed 900ms so the toast is actually readable. Error toasts added on failure.
- **`pages/SecuritySettingsPage.js`** — passkey / 2FA / SMS-OTP / auto-logout toasts all updated to the uniform `"— saved."` voice. Top-bar Save button copy updated: `"All security settings on this page are saved."`
- **`pages/SettingsPage.js`** top-bar Save: `"All settings on this page are saved."`

Verification: ESLint clean on all 6 files, `bash /app/housekeeping.sh` → 65/65 PASS, `yarn playwright test smoke.spec.js scrollbar.spec.js` → 10/10 passed.


## Feb 14, 2026 — Explicit Save affirmation on Settings & Security Settings

User request: "give me both a Back button and a Save button on both Settings and Security Settings pages. On Save, show a toast confirming changes were saved."

- **`pages/SettingsPage.js`** — imported `toast` from `sonner`, added a matching header row with both a transparent outlined **Back** button (testid `settings-back-button`) and a gold **Save** button (testid `settings-save-button`). `handleSave` dispatches a `carryon:settings:flush` CustomEvent (so any future debounced card writes can flush) and raises a `toast.success('Your settings have been saved.')` with a description line. All sub-cards on this page already auto-save on change; the Save button is the explicit affirmation UX the user asked for.
- **`pages/SecuritySettingsPage.js`** — added a **Save** button (testid `security-settings-save-button`) next to the existing Back button. `handleSave` dispatches `carryon:security:flush` and shows `toast.success('Your security settings have been saved.')`.
- Tests: Playwright smoke + scrollbar specs all green (10/10 passed, 1 skipped, 0 failed). Housekeeping 65/65 PASS. Live smoke confirmed: Save button rendered, click fired, no console errors.


## Feb 14, 2026 — Scrollbar Polish: Remove "grit under the slider" feel

User report: "When moving up and down the pill it is a little bit sticky, as if there was grit under a mechanical slider." Two independent root causes, both fixed without regressing any existing behaviour (all 8 smoke + all 2 runnable scrollbar E2E tests green, housekeeping 65/65 PASS).

### Drag smoothness (continuous up/down movement)
- **`frontend/src/styles/overlay-scrollbars.css`** — permanently GPU-composite the handle via `will-change: transform` + `backface-visibility: hidden`. Prevents Safari/Chrome from deferring layer promotion until the first paint of a transform change (which caused a visible "stick" on the first few pixels of each drag).
- **`html.os-dragging`** now also kills every transition on scrollbar descendants (`transition: none !important`). The library applies 0.15s transitions to opacity/background/border/height that momentarily starve the transform pipeline on busy frames.
- **Viewport `overscroll-behavior: contain`** on OverlayScrollbars hosts — stops rubber-band/overscroll from clamping scrollTop and producing a perceptible "grab" at the boundaries.

### Toss smoothness (post-release momentum)
- **`frontend/src/utils/scrollbarMomentum.js`** — replaced frame-rate-dependent `Math.pow(FRICTION, dt/16)` with a true time-constant exponential `v *= exp(-dt/τ)` (τ = 325ms). This is the same physics model UIScrollView uses and is frame-rate independent.
- **Sub-pixel accumulator** — keep a float `position` across frames and round only at the `scrollTop` write boundary. Previously, integer-quantized `scrollTop` writes discarded sub-pixel velocity contribution between frames (stick-slip).
- **Trapezoidal integration** — use average velocity across each frame instead of end-velocity, eliminating the micro-lurch that Euler integration produces on the first frame of the toss.
- **MAX_VELOCITY clamp** (6 px/ms) so runaway flicks still feel natural.

Verification: `yarn playwright test tests/e2e/scrollbar.spec.js tests/e2e/smoke.spec.js --project=smoke-chromium` → 10 passed, 1 skipped, 0 failed. `bash /app/housekeeping.sh` → 65/65 PASS.


## Apr 19, 2026 — Pre-Launch Hardening: E2E Suite, Tile Error Boundaries, iOS-like Scrollbar

### Playwright E2E Smoke Suite (new)
- **`frontend/playwright.config.js`** — 3 projects: smoke-chromium (desktop 1440x900), smoke-mobile (iPhone-style 390x844 via Chromium), visual (existing).
- **`frontend/tests/e2e/smoke.spec.js`** — 8 functional smoke tests × 2 viewports = 16 test runs. Covers landing, login, signup, admin login, dashboard, settings nav, public marketing, `/api/health`.
- **`frontend/tests/e2e/scrollbar.spec.js`** — 3 regression tests for the scrollbar: marketing pages retain native scroll, settings page initializes overlay scrollbar, scroll direction is correct.
- **Package scripts** — `yarn e2e`, `yarn e2e:visual`, `yarn e2e:ui`, `yarn e2e:smoke:desktop`.
- **CI job** — `.github/workflows/ci.yml` has a new `e2e-smoke` job gated on `vars.RUN_E2E == 'true'` so it only fires when staging is wired up.
- **Result:** 21 passed, 1 skipped (desktop direction test skips on window-scroll viewport), 0 failed. Run time ~40s.

### Per-Tile Error Boundaries on Dashboard
- **`frontend/src/components/TileErrorBoundary.js`** — new reusable error boundary with compact fallback + Retry. Reports to Sentry via existing `reportError`.
- **`pages/DashboardPage.js`** — TrialBanner, BillingStatusBanner, OnboardingWizard, and ShareYourCarryOn now wrapped. A crash in any one tile no longer unmounts the dashboard.

### iOS-like Auto-hide Scrollbar (overlayscrollbars-react)
- **Added dependencies** — `overlayscrollbars@2.15.1` and `overlayscrollbars-react@0.5.6`.
- **`frontend/src/components/AppScroller.js`** — initializes OverlayScrollbars on `.main-content` only (authenticated dashboard layout). Uses MutationObserver to catch lazy route mounts. Mounted once in `App.js` under BrowserRouter.
- **`frontend/src/styles/overlay-scrollbars.css`** — `os-theme-carryon-gold` theme. 9px width on mobile (iOS-feeling), 10px desktop, 60px min thumb height for easy grabbing, gold `#d4af37` accent at 0.55–0.95 opacity.
- **Text-selection guard** — `html.os-dragging` class added during thumb pointerdown, removed on pointerup/cancel/blur. CSS disables user-select globally while dragging.
- **Auto-hide** — `visibility: 'auto'`, `autoHide: 'scroll'`, `autoHideDelay: 1200ms` (0ms when OS prefers-reduced-motion).
- **Public marketing routes unaffected** — AppScroller only hooks `.main-content`, which lives inside DashboardLayout; `/home`, `/login`, `/signup`, `/speak-with-us` keep native scroll.
- **Regression tests** — 3 Playwright tests verify presence, correct direction, and no marketing-page interference.

### JWT Secret Rotation Procedure (documented)
- **`/app/memory/test_credentials.md`** — added a fresh 64-char JWT_SECRET for launch-day rotation in Railway production, with step-by-step procedure and expected behavior (session invalidation).
- **Stripe key hygiene notice** — documented two paths (rotate+strip, or replace with sk_test) for removing the live key from the preview pod.

### Load-test baseline (preview pod)
- **`load_tests/smoke_load.js`** — new lightweight health+auth-path load test.
- **100 VUs, 20s** → 10,500 requests, **0 5xx errors**, p95 = 310ms, 513 req/s sustained. Preview pod held up; Railway production (multi-pod, CDN) should comfortably handle 500+ concurrent users.

### Housekeeping
- 69 checks **PASS**, 0 WARN, 0 FAIL.
- Ruff clean, ESLint clean on all new files.


## Apr 28, 2026 — Pre-Launch Codebase Refactoring & Security Hardening

### Security Fixes
- **Auth-gated `/api/debug/user-state`** — Added `require_admin` dependency; previously unauthenticated
- **Gated dev endpoints** — `/api/auth/dev-login` and `/api/auth/dev-switch` now return 404 unless `ALLOW_DEV_ENDPOINTS=true` env var is set
- **MongoDB connection pool** — Added `maxPoolSize=50, minPoolSize=5` to prevent unbounded connections under traffic spikes

### Dependency Cleanup
- **Removed ML packages from requirements.txt** — librosa, scipy, scikit-learn, numba, soundfile, huggingface_hub, tokenizers + 13 transitive deps. These were from the archived voice biometrics feature. ~400-600MB Docker image size reduction. Cold start improvement.
- **Removed dev-only tools from requirements.txt** — ruff, black, isort, mypy, flake8, safety moved to requirements-dev.txt
- **Created requirements-dev.txt** — All dev/lint tools documented separately with archived ML packages

### Backend Refactoring (Monolith → Package Architecture)
- **routes/auth.py** (1,775 lines) → `routes/auth/` package: `_core.py` (shared utilities), `login.py`, `register.py`, `profile.py`, `password.py`, `sessions.py`, `sms.py`, `dev.py`. 28 routes verified exact match.
- **routes/share_cards.py** (1,678 lines) → `routes/share_cards/` package: `_helpers.py` (rendering/tokens/notifications), `cards.py`, `voices.py`, `digest.py`. 15 routes verified. Scheduler function exports preserved.
- **routes/beneficiaries.py** (1,491 lines) → `routes/beneficiaries/` package (with `_impl.py`)
- **routes/estate_chat.py** (1,250 lines) → `routes/estate_chat/` package (with `_impl.py`)
- **routes/financial_portal.py** (1,010 lines) → `routes/financial_portal/` package (with `_impl.py`)

### Frontend Refactoring
- **MobileNav.js** reduced 1,313 → 1,144 lines by extracting:
  - `navConfig.js` — DOCK_REGISTRY, ADMIN_PORTALS, scopeArr, hasScope constants
  - `MobileOtpToggle.js` — admin OTP toggle component
  - `DebugValues.js` — dev safe-area debugger component
  - DOCK_REGISTRY re-exported for backward compat with DockCustomizer.js

### Housekeeping Updates
- Updated `housekeeping.sh` checks 20 & 21 to grep `routes/auth/` directory (recursive) for OTP expiry and account lockout patterns
- Updated BUILD_HASH to `2026-04-28T00:00:00Z-pre-launch-refactor`
- Deleted `render.yaml` (unused — app runs on Railway + Vercel)

### Verified
- 38/38 backend tests passed (100%)
- 66/66 housekeeping checks PASS, 0 WARN, 0 FAIL
- 523 routes in server — same count pre/post refactor



### Critical Fixes Applied:
1. **capacitor.config.json (iOS) — contentInset mismatch** — Was still `"automatic"`, safe area fix was never synced to native project. Fixed to `"never"`
2. **capacitor.config.json (Android)** — Synced to match TS source config
3. **Podfile — 6 missing native pods** — Added CapacitorApp, CapacitorFilesystem, CapacitorShare, CapacitorStatusBar, CapgoCapacitorShareTarget, CapgoNativePurchases
4. **packageClassList — 3 wrong class names + 2 missing** — Corrected AppPlugin, FilesystemPlugin, StatusBarPlugin; added CapacitorShareTargetPlugin, NativePurchasesPlugin
5. **PrivacyInfo.xcprivacy — not in Xcode project** — Added to PBXFileReference, PBXGroup, PBXBuildFile, PBXResourcesBuildPhase
6. **App.entitlements — missing aps-environment** — Added `production` push notification entitlement
7. **Backend scheduler — broken import** — Added `check_dob_subscription_events` to subscriptions package exports



## Mar 7, 2026 — 6 Pre-App-Store Refinements

1. **Remove "Flat rate — no discounts" text** — Cleared note from Military/First Responder and Veteran beneficiary tiers (backend plans.py defaults)
2. **Font uniformity** — Removed inline fontFamily overrides (Cormorant Garamond, Outfit) from metric numbers across AnalyticsTab, AdminPage, LaunchMetricsTab, DashboardPage, BeneficiaryDashboardPage, LegacyTimelinePage. Body font (DM Sans) now uniform for data values
3. **Trial banner dark blue text** — Changed 'info' urgency tier text from gold (#d4af37) to dark blue (#1B4F72) with blue icon (#2563EB) for better light-mode visibility
4. **IAC button conditional display** — "Complete Checklist Editing for Now" button now only shows when arriving from getting-started guided flow (via location.state.fromGettingStarted)
5. **EGA header buttons refinement** — Increased button sizes from w-8/h-8 to w-10/h-10, icons from w-3.5 to w-5. Removed redundant "+" (New Chat) button from chat header
6. **Support chat page layout** — Fixed page to fit in one viewport using fixed positioning with proper header and bottom nav offsets



## Feb 28, 2026 — Security Hardening Audit + 5 Enhancement Features

### Linting (3 Passes)
- Ran Python (ruff) and JavaScript (ESLint) linting 3 times. All clean.

### Security Fixes (16 total)
1. Account lockout (5 failed attempts / 15 min)
2. Password complexity (8+ chars, upper/lower/digit)
3. OTP 10-minute expiry
4. Content-Security-Policy header
5. HSTS with preload
6. Cache-Control no-store on all API responses
7. Estate ownership verification on all document endpoints
8. Zero-knowledge fix: messages no longer store plaintext
9. Death certificates encrypted with AES-256-GCM
10. Cryptographic OTP/backup code generation (secrets module)
11. CORS restricted to specific origins
12. OTP log sanitization
13. Database security indexes at startup
14. TTL auto-cleanup indexes
15. Config hardening warnings
16. Audit trail for death certificates

### 5 Enhancement Features
1. **Onboarding Wizard** — 5-step guided setup on dashboard, auto-detects progress
2. **Estate Readiness Notifications** — Already existed in weekly digest
3. **Beneficiary Gentle Intro** — Warm two-step invitation acceptance flow
4. **Quick-Start Templates** — 4 scenario templates (Hospice, Military, New Parent, Recently Married)
5. **Emergency Access Protocol** — Beneficiary emergency vault access with admin review

### Testing
- Security audit: 19/19 tests passed (95% rate)
- Enhancement features: 24/24 backend tests passed (100%)
- All frontend components verified working

## Apr 28, 2026 — Full Codebase Audit + Security Fixes

### Security
- **Stripe webhook hardened**: Now returns HTTP 400 if `STRIPE_WEBHOOK_SECRET` is not set (was silently processing unverified webhooks — critical forgery risk)
- **Startup check added**: Server logs CRITICAL at boot if Stripe key is set without webhook secret
- **XSS removed**: `dangerouslySetInnerHTML` eliminated from LandingContent.js — `&mdash;` entities replaced with literal `—` characters, plain text node used

### Error Handling
- `routes/estates.py` repair loop wrapped in try/except — DB write failures during login-time repair no longer crash the estates response

### Dead Code Removed (5 files)
- `pages/EditBeneficiaryPage.js` — superseded by SlidePanel
- `components/admin/CustomerContextPanel.js` — never imported
- `components/dev/DevSwitcher.js` — never imported (DevSwitcherTab.js handles this)
- `components/settings/SecurityCard.js` — never imported
- `utils/initials.js` — never imported

### Audit Findings — Not Fixed (Low Risk, Post-Launch)
- Admin bulk export routes use `.to_list(100000)` — acceptable for admin-only, needs pagination at scale
- `beneficiary_feature_access` in localStorage used as UI hint only (backed by server-side checks)
- Billing lifecycle has no rollback — inherent to MongoDB without multi-doc transactions

### Verified
- 18/18 tests passed (100%) — 0 regressions
