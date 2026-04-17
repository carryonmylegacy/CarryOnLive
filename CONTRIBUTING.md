# Contributing — CarryOn™

## Before you push

**One command that runs everything:**
```bash
bash scripts/check.sh
```

Exits `0` if safe to push, non-zero if anything is broken.

### What it runs

1. **Housekeeping protocol** — 65 checks including:
   - `ruff check` + `ruff format --check` (backend lint + format)
   - ESLint (frontend errors)
   - `yarn build` (frontend build)
   - SOC 2 compliance checks (auth guards, audit trail, encryption, GDPR)
   - iOS App Store readiness (IAP, Capacitor, disclosures, entitlements)
   - PWA / mobile UX (safe-area insets, touch targets, viewport)
   - Vercel deployment readiness (imports, Capacitor versions, peer deps)

2. **Frontend ESLint errors** (`yarn lint:errors`)

3. **Backend pytest suite** — opt-in via `HK_RUN_TESTS=1`

4. **Lighthouse performance** — opt-in via `HK_RUN_LIGHTHOUSE=1`

### Strict mode

Treat warnings as failures (for release candidates):

```bash
bash scripts/check.sh   # via housekeeping.sh --strict if you want just HK
bash housekeeping.sh --strict
```

## One-time setup (after cloning)

```bash
bash scripts/setup-dev.sh
```

This wires the pre-commit hook into git. After setup, every `git commit` will:
- Run `ruff format` on staged backend files (auto-fix + re-stage)
- Run `ruff check` on staged backend files (auto-fix safe issues)
- Run ESLint on staged frontend files (errors only)
- Block the commit if anything can't be auto-fixed

To bypass in an emergency: `git commit --no-verify`

## Auto-fix commands

```bash
# Backend
cd backend && ruff format . && ruff check --fix .

# Frontend
cd frontend && yarn lint:fix
```

## CI reference

`.github/workflows/ci.yml` runs:
- `secret-scan` (gitleaks — non-blocking, surfaces findings)
- `backend-lint` (ruff check + ruff format --check)
- `frontend-lint` (yarn lint:errors)
- `backend-tests` (pytest with PYTHONDEVMODE=1 to surface DeprecationWarnings)
- `frontend-build` (yarn build + main bundle size check)

`.github/workflows/lighthouse.yml` runs Lighthouse on main + PRs.

`.github/dependabot.yml` opens weekly PRs for:
- pip security patches
- npm security patches (Capacitor major-version updates pinned)
- GitHub Actions updates (monthly)

## Schema drift

After confirming a healthy state, snapshot the Mongo schema:
```bash
MONGO_URL=mongodb://... DB_NAME=carryon python3 scripts/schema_snapshot.py --save
```

In CI or pre-push, check for drift:
```bash
python3 scripts/schema_snapshot.py --check   # exit 1 on drift
```

## Visual regression

Framework scaffolded at `frontend/tests/visual/`. To enable:
```bash
cd frontend
yarn add -D @playwright/test
npx playwright install chromium
npx playwright test tests/visual/ --update-snapshots   # first run: baseline
git add frontend/tests/visual/__screenshots__/         # commit baselines
```

## Emergency commands

```bash
# "My commit is blocked and I need to push NOW"
git commit --no-verify

# "CI is failing on format — fix and re-push"
cd backend && ruff format . && cd .. && git add -u && git commit --amend --no-edit && git push --force-with-lease

# "Check everything without pushing"
bash scripts/check.sh
```
