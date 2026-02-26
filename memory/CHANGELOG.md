# CarryOn - Changelog

## Feb 26, 2026 — Code Quality Perfection Pass

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
