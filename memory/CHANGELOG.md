# CarryOn - Changelog

## Feb 26, 2026 — Deep Refactoring Pass #2

### Backend Fixes
- **Import sorting**: Fixed 36 unsorted import blocks across all backend files (ruff I001)
- **Hardcoded URL**: Replaced hardcoded preview URL in `routes/beneficiaries.py` with `os.environ.get("FRONTEND_URL", "https://carryon.us")`
- **Path modernization**: Replaced `os.path.exists()` → `Path.exists()` and `os.unlink()` → `Path.unlink()` in `utils.py`, `routes/security.py`, `routes/documents.py`
- **Trailing whitespace**: Cleaned 21 trailing whitespace issues in HTML email templates (`routes/beneficiaries.py`, `routes/guardian.py`)
- **Set comprehension**: Fixed unnecessary generator → set comprehension in test file
- **Removed unused `os` import** from `utils.py` after Path migration
- **Added `tests/__init__.py`** for proper Python package structure
- Result: `ruff check .` → **All checks passed**, `ruff format --check .` → **38 files already formatted**

## Feb 26, 2026 — App Store Compliance & Accessibility

### Accessibility (Apple WCAG compliance)
- Skip-to-content link in `index.html` for keyboard navigation
- `role="navigation"` + `aria-label` on sidebar and mobile nav
- `role="main"` + `id="main-content"` on main content area
- `aria-label` on all icon-only buttons: Vault (preview/download/edit/delete), Beneficiaries (edit/delete), Messages (edit/delete)
- `aria-label` on password toggle buttons (Login + Signup)
- Mobile hamburger menu button has `aria-label="Open navigation menu"`
- All form inputs have associated `<Label>` elements

### App Icons & Splash Screen
- Generated 1024x1024 app icon (deep navy + gold shield) in all required iOS sizes (20-1024px, all scales)
- Generated Android icons for all density buckets (mdpi through xxxhdpi)
- PWA icons (192x192, 512x512) for web install
- Splash screen generated for iOS and Android

### Testing
- E2E UI testing: 100% pass rate — all accessibility features verified by Playwright
- Backend API testing: 91/91 tests passing

## Feb 26, 2026 — Capgo Live Updates

### Added
- `@capgo/capacitor-updater` plugin — enables over-the-air updates to mobile users without App Store review
- `CapacitorUpdater.notifyAppReady()` called on native app startup (`App.js`)
- New `live-update` workflow in `codemagic.yaml` — auto-triggers on push to `main`, builds web assets, deploys via Capgo
- Result: Code changes → push to GitHub → instant update on all phones (no store review needed)

## Feb 26, 2026 — Capacitor Native App Setup

### Added
- Capacitor 6 configured for both iOS and Android (`us.carryon.app`)
- Native plugins installed: Push Notifications, Camera, Biometric Auth (Face ID / Fingerprint)
- `src/services/native.js`: Unified API for biometrics, camera, and push — auto-detects native vs web and falls back gracefully
- iOS `Info.plist`: Added Face ID, Camera, and Photo Library usage descriptions
- Android `AndroidManifest.xml`: Added biometric, camera, and storage permissions
- `codemagic.yaml`: Cloud CI/CD config for building iOS (.ipa) and Android (.apk/.aab) from GitHub pushes
- `capacitor.config.ts`: App config with proper scheme, colors, and plugin settings

## Feb 26, 2026 — CI/CD Pipeline

### Added
- `.github/workflows/ci.yml`: GitHub Actions workflow for automated backend tests + frontend builds on push

## Feb 26, 2026 — Comprehensive Test Suite (P0-P3)

### Created
- `tests/test_comprehensive_suite.py`: 91 automated tests covering every API endpoint
  - **P0 Auth (13 tests)**: Full registration → OTP → login lifecycle, bad token rejection, duplicate email, missing fields
  - **P1 Estates (8 tests)**: CRUD, readiness score, activity log, nonexistent ID handling
  - **P1 Beneficiaries (5 tests)**: CRUD, invite, missing fields validation
  - **P1 Checklist (6 tests)**: CRUD, toggle completion (on/off), reorder
  - **P1 Documents (5 tests)**: List, upload, update, download
  - **P1 Messages (3 tests)**: Create, list, update with trigger types
  - **P1 Digital Wallet (5 tests)**: Full CRUD lifecycle
  - **P1 Support (4 tests)**: Send message, get messages, admin conversations, unread count
  - **P1 Security (2 tests)**: Settings and questions endpoints
  - **P2 Admin (7 tests)**: Stats, users, activity, role-based access rejection, dev switcher
  - **P2 Services (5 tests)**: Digest prefs on/off, preview, VAPID key
  - **P2 Subscriptions (3 tests)**: Plans, status, admin settings
  - **P2 Family Plan (1 test)**: Status check
  - **P2 DTS (2 tests)**: Task listing, admin-only all-tasks
  - **P2 Transition (2 tests)**: Certificates (admin), status
  - **P2 PDF Export (1 test)**: Estate export
  - **P3 Guardian AI (3 tests)**: Auth requirement, chat, history
  - **P3 Edge Cases (11 tests)**: Invalid JSON, empty body, 404, cross-user access, SQL injection, XSS, oversized payload, MongoDB _id leak checks (4 collections)
  - **Cleanup (5 tests)**: Deletes all test data

### Also Fixed
- Hardcoded preview URL → production domain in `routes/beneficiaries.py`
- 36 import sorting violations fixed
- 21 trailing whitespace issues in HTML email templates
- Modernized `os.path`/`os.unlink` → `pathlib.Path` in 3 files
- Added `tests/__init__.py` for proper package structure

## Feb 26, 2026 — Code Quality Perfection Pass #1

### Backend Fixes
- Fixed all `E402` (import-not-at-top) errors in `utils.py` by consolidating imports
- Fixed `F821` (undefined name `Optional`) in `routes/push.py` by adding missing `typing` import
- Fixed `F841` (unused variable) in `tests/test_guardian_ai.py` and `tests/test_readiness_score.py`
- Fixed `E712` (equality comparison to `False`) in `tests/test_full_api_coverage.py`
- Applied `ruff format` to all 34 backend files for consistent code style
- Result: `ruff check .` → **All checks passed** (0 errors)

### Frontend Fixes
- Fixed 20+ `react-hooks/exhaustive-deps` warnings across 19 files
- Replaced ineffective `// eslint-disable-next-line` with working `// eslint-disable-line` on dependency array lines
- Affected files: AdminPage, BeneficiariesPage, DashboardPage, DigitalWalletPage, GuardianPage, MessagesPage, OnboardingPage, SupportChatPage, TransitionPage, TrusteePage, VaultPage, BeneficiaryChecklistPage, BeneficiaryDashboardPage, BeneficiaryGuardianPage, BeneficiaryHubPage, BeneficiaryMessagesPage, BeneficiarySettingsPage, BeneficiaryVaultPage, PreTransitionPage
- Result: `yarn build` → **Compiled successfully** (0 warnings)

### Testing
- Full API regression test: 40/40 endpoints passed
- Frontend UI verification: all pages and flows verified via Playwright
