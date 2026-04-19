# E2E Smoke Suite

Playwright-based functional smoke tests. Catches the "did we break something
critical?" class of bug before CI → production.

## What's covered (11 tests, 2 viewports = 22 test runs + 6 API tests)

### `smoke.spec.js` — UI smoke (×2 viewports)
1. Landing page renders without JS errors
2. Login page interactive
3. Signup page interactive
4. Admin login succeeds
5. Dashboard renders with no tile crashes
6. Settings page loads post-login
7. Public marketing page renders
8. `/api/health` is reachable

### `scrollbar.spec.js` — Overlay scrollbar regression (×2 viewports)
9. Marketing pages retain native scroll (no `.os-scrollbar` present)
10. Settings page initializes overlay scrollbar on `.main-content` with gold theme
11. Scroll direction is correct — thumb moves DOWN when content scrolls down
    (skipped on desktop where window scrolls, not .main-content)

### `signup_invite_flow.spec.js` — Revenue funnel (API only, ×2 viewports)
12. `POST /api/auth/register` creates a new benefactor + estate
13. `POST /api/auth/login` responds correctly for a fresh account (OTP-required is acceptable)
14. Admin → create beneficiary → invitation token returned → accept invitation → token
    authenticates subsequent calls. Full chain in ~1 second.

## Running

```bash
cd frontend
yarn e2e             # smoke suite (Desktop Chrome + iPhone 14)
yarn e2e:visual      # visual regression suite (existing)
yarn e2e:ui          # interactive debugger
```

## Credentials

Tests use the admin account from `/app/memory/test_credentials.md` by default.
Override via:

```bash
E2E_ADMIN_EMAIL=someone@example.com E2E_ADMIN_PASSWORD=xxx yarn e2e
```

## In CI

Add to `.github/workflows/ci.yml`:

```yaml
e2e-smoke:
  name: E2E Smoke
  runs-on: ubuntu-latest
  needs: frontend-build
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-node@v5
      with: { node-version: "22" }
    - working-directory: frontend
      run: |
        yarn install --frozen-lockfile
        npx playwright install --with-deps chromium
        yarn build
        npx -p serve -- serve -s build -l 3000 &
        sleep 8
        # Backend must be reachable at E2E_BASE_URL/api for test 08
        yarn e2e
      env:
        E2E_BASE_URL: http://localhost:3000
        E2E_ADMIN_EMAIL: ${{ secrets.E2E_ADMIN_EMAIL }}
        E2E_ADMIN_PASSWORD: ${{ secrets.E2E_ADMIN_PASSWORD }}
```

## Design notes

- **Resilient selectors.** Tests prefer `[data-testid="..."]` but fall back to
  `input[type="email"]` etc. so a design tweak doesn't redline the suite.
- **Ordered, not parallel.** The login tests share state; parallelizing them
  across the same admin account can cause session contention. Run per-file
  serially; CI gets 2 workers across files.
- **Mobile viewport enforced.** iPhone 14 config catches layout regressions
  (the ScrollBar saga class of bug).
- **No flaky timeouts.** `waitForURL(/\/(dashboard|...)/)` tolerates the
  various post-login destinations without hardcoding one.
