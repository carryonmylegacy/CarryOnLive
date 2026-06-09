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
Goal: Vercel must NOT publish a Production build until the `SOC2 Deploy Gate`
status check on that commit is green.

NOTE: Vercel moved "Ignored Build Step" — it is **NO LONGER under Settings → Git**.
It now lives under **Settings → Build and Deployment** (older UIs: "General").

Step by step:
1. Go to **https://vercel.com** → your team → the CarryOn frontend **Project**.
2. **Settings** (top nav) → **Build and Deployment** (left sidebar).
3. Scroll to the **"Ignored Build Step"** section.
4. Change the dropdown from "Automatic" to **"Run my Bash script / Custom"**, and
   paste a command that SKIPS the build unless the deploy gate succeeded on this
   commit:
   ```bash
   bash -c 'ok=$(curl -s -H "Authorization: Bearer $GH_CHECK_TOKEN" \
     "https://api.github.com/repos/<OWNER>/<REPO>/commits/$VERCEL_GIT_COMMIT_SHA/check-runs" \
     | grep -o "\"name\":\"SOC2 Deploy Gate[^}]*\"conclusion\":\"success\"" ); \
     [ -n "$ok" ] && exit 1 || exit 0'
   ```
   - Vercel semantics: **exit 1 = build proceeds**, **exit 0 = build is skipped**.
     So this proceeds only when the gate's conclusion is `success`.
   - Replace `<OWNER>/<REPO>` with your repo path.
   - Add a Vercel **Environment Variable** (Settings → Environment Variables)
     `GH_CHECK_TOKEN` = a fine-grained GitHub PAT with **read-only** "Checks" +
     "Contents" permission on the repo.
5. **Save**, then push one commit and watch the **Deployments** tab show
   "Skipped — build canceled" until the GitHub `SOC2 Deploy Gate` check is green.

Alternative (no script): you already have a Deploy Hook named **"Emergent" on
`main`** (Settings → Git → Deploy Hooks). You can instead turn OFF Vercel's
auto-deploy-on-push and have the GitHub `deploy-gate` job `curl` that hook ONLY
on success — same pattern as Render §4 below. Tell me and I'll add the CI step.

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
