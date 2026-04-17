# Visual Regression Tests

Playwright-based screenshot diffs for critical public pages. Catches the
"accidentally shifted 20px" class of bug before users do.

## Setup (one-time, ~5 min)

```bash
cd frontend
yarn add -D @playwright/test
npx playwright install chromium
```

## Generate baseline

Run after confirming the app looks correct, to capture reference screenshots:

```bash
cd frontend
# Make sure dev server is running on localhost:3000, then:
npx playwright test tests/visual/ --update-snapshots
```

Commit the resulting `tests/visual/__screenshots__/` directory to git.

## Check for regressions

```bash
cd frontend
npx playwright test tests/visual/
# exit 0 = no regression
# exit 1 = visual diff detected; report at playwright-report/index.html
```

## In CI

Add to `.github/workflows/ci.yml` (not added yet — gated behind `yarn add`):

```yaml
visual-regression:
  name: Visual Regression
  runs-on: ubuntu-latest
  needs: frontend-build
  steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-node@v5
      with: { node-version: "22" }
    - working-directory: frontend
      run: |
        yarn install --frozen-lockfile
        npx playwright install chromium
        yarn build
        npx -p serve -- serve -s build -l 3000 &
        sleep 5
        VISUAL_BASE_URL=http://localhost:3000 npx playwright test tests/visual/
```

## Notes

- Baselines should be generated on Linux (same as CI runner) to avoid
  font-rendering differences.
- `maxDiffPixelRatio: 0.02` allows 2% pixel difference — tune if too strict.
- When you intentionally change a design, re-run with `--update-snapshots`
  and commit the new baseline.
