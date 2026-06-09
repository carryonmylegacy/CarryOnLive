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

## 3. Vercel (frontend production) — make the deploy WAIT for the gate
This is now handled IN CODE (no PAT, no Ignored-Build-Step script needed):
  - `frontend/vercel.json` sets `git.deploymentEnabled.main = false` → a plain
    git push to `main` NO LONGER auto-deploys production. Deploy Hooks still work.
  - `.github/workflows/ci.yml` `deploy-gate` job has a final `if: success()`
    step that POSTs the Vercel **Deploy Hook** only after the gate is green.

The ONLY manual step left (one repo secret):
1. Vercel → your project → **Settings → Git → Deploy Hooks**. Use the existing
   **"Emergent" / main** hook (click **Copy** to copy its URL), or click
   **Create Hook** (name it `soc2-gate`, branch `main`) and copy that URL.
2. GitHub → repo → **Settings → Secrets and variables → Actions → New repository
   secret**. Name = `VERCEL_DEPLOY_HOOK_URL`, Value = the copied hook URL → **Add**.

After that: a push to `main` runs CI; production deploys ONLY when the deploy
gate passes and triggers the hook. Until the secret is set, the CI step is a
no-op (it logs a notice and the build still passes), so nothing breaks.

> To revert the "no git auto-deploy" behavior, delete the `git` block from
> `frontend/vercel.json`.

## 4. Render (backend production) — make the deploy WAIT for the gate
Goal: Render must NOT roll out a new backend until the `SOC2 Deploy Gate` check
on that commit is green.

Step by step:
1. Go to **https://dashboard.render.com** → your backend service (`carryon-api`).
2. Left sidebar → **Settings**.
3. Find **"Build & Deploy"** → **Auto-Deploy**.
4. Render's native option: set **Auto-Deploy = "After CI Checks Pass"** (Render
   shows this when the repo has GitHub Actions checks; it waits for **all**
   required checks — including `SOC2 Deploy Gate` — to succeed on the commit
   before deploying). Select it and **Save Changes**.
5. If your plan/region doesn't show "After CI Checks Pass":
   - Set **Auto-Deploy = No** (turn it off), AND
   - Add a **Deploy Hook** (Settings → Deploy Hook → copy the URL), then add a
     final step to the `deploy-gate` job in `.github/workflows/ci.yml` that
     `curl`s that hook **only on success** — so Render deploys *because* the gate
     passed, never before. (Tell me if you want this CI step added; it's a small
     code change on our side.)
6. **Verify:** push a commit, open Render's **Events** tab — it should show the
   deploy starting **only after** the GitHub `SOC2 Deploy Gate` check is green,
   not on the raw push.

> ⚠️ Why this section matters: Emergent's "Save to GitHub" pushes commits
> **directly to `main`**, and your branch ruleset (section 2) **bypasses admins**
> so those pushes aren't blocked. That's intentional — but it means Render/Vercel
> auto-deploy-on-push would otherwise ship a commit *before* CI finishes. Sections
> 3–4 are what make production actually wait for the gate.

## 5. Evidence retention
- `soc2-deploy-evidence` artifact (90 days) is attached to every `main` run.
- `playwright-report` artifact (14 days) is attached on E2E failure.
- For long-term SOC2 evidence, periodically export these artifacts to the
  compliance evidence store (e.g., the audit S3 bucket) — GitHub artifact
  retention is not indefinite.

> Owner action required: items **1–4** are dashboard toggles only an admin can
> set. The workflow + evidence artifact (this commit) are the code-side half.
