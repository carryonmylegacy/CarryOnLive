# Deploy Protection Settings (SOC2 CC8.1 change management)

The CI workflow (`.github/workflows/ci.yml`) now enforces a single aggregate
**`SOC2 Deploy Gate (all required checks green on main)`** job that fails unless
secret-scan, backend-lint, frontend-lint, backend-tests, frontend-build, and the
E2E smoke are all green on a `main` push, and writes a 90-day
`soc2-deploy-evidence` artifact.

The workflow is the *evidence producer*. Making it **block** merges and
production deploys requires a few dashboard settings that **cannot be set from
code** — a repo/org admin must apply them once. (audit #5391e8b #8)

## 1. GitHub — Repo variable + E2E secrets
Settings → Secrets and variables → Actions:
- **Variables**: `RUN_E2E = true`
- **Secrets**: `E2E_BASE_URL`, `E2E_API_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`

Without `RUN_E2E=true` + these secrets, the deploy gate fails by design (no
end-to-end change-management evidence).

## 2. GitHub — Branch protection on `main`
Settings → Branches → Add branch ruleset (or classic protection) for `main`:
- ☑ **Require status checks to pass before merging**
  - Required check: **`SOC2 Deploy Gate (all required checks green on main)`**
    (this transitively requires all upstream jobs). Optionally also mark
    `Secret Scan (gitleaks)`, `Backend Tests`, `Frontend Build` as required.
  - ☑ Require branches to be up to date before merging
- ☑ **Require a pull request before merging** (≥1 review; ≥1 from code owners)
- ☑ **Do not allow bypassing the above settings** (applies to admins)
- ☑ **Require signed commits** (recommended)

## 3. Vercel (frontend production) — block on CI
Vercel → Project → Settings → Git:
- ☑ **"Only deploy Production when the CI checks pass"** (Ignored Build Step /
  "Wait for CI" — enable *Require CI checks to succeed* for the Production
  branch). If using the GitHub integration's required checks, the branch
  protection above already prevents an unverified commit from reaching `main`.
- Alternatively set an **Ignored Build Step** that exits non-zero unless the
  deploy gate passed.

## 4. Render (backend production) — block on CI
Render → Service → Settings:
- Turn **Auto-Deploy** to **"After CI checks pass"** (Render → Settings →
  Build & Deploy → *Auto-Deploy: On Commit* → enable *"Wait for CI"*), or
- Set Auto-Deploy **off** and deploy only via the GitHub deployment that the
  `deploy-gate` job gates.

## 5. Evidence retention
- `soc2-deploy-evidence` artifact (90 days) is attached to every `main` run.
- `playwright-report` artifact (14 days) is attached on E2E failure.
- For long-term SOC2 evidence, periodically export these artifacts to the
  compliance evidence store (e.g., the audit S3 bucket) — GitHub artifact
  retention is not indefinite.

> Owner action required: items **1–4** are dashboard toggles only an admin can
> set. The workflow + evidence artifact (this commit) are the code-side half.
