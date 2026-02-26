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
