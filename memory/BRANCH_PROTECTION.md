# GitHub Branch Protection — `main`

This doc locks in the CI quality gate by requiring the CarryOn CI pipeline
to pass before anything merges into `main`. Apply the settings exactly as
listed; none of them block solo development (push-to-your-own-branch still
works) — they only gate merges into `main`.

---

## 1. Navigate

1. Open `https://github.com/<YOUR_ORG_OR_USER>/CarryOnLive`
2. **Settings** (repo-level, not org-level)
3. Sidebar → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**

> *If your repo was created before rulesets existed, use **Settings → Branches → Add rule** instead. The field names are slightly different but the meaning is identical — the mapping is noted inline below.*

---

## 2. Ruleset basics

| Field                    | Value                                  |
| ------------------------ | -------------------------------------- |
| **Ruleset name**         | `protect-main`                         |
| **Enforcement status**   | **Active**                             |
| **Bypass list**          | *(leave empty — no one bypasses)*      |
| **Target branches**      | **Include default branch** (= `main`)  |

---

## 3. Rules to enable

Check the following boxes. Defaults for unchecked boxes are fine.

### Restrict deletions
- [x] **Restrict deletions** — prevents accidental `git push --delete origin main`.

### Require a pull request before merging
- [x] **Required approvals**: `1`
- [x] **Dismiss stale pull request approvals when new commits are pushed**
- [ ] Require review from Code Owners *(optional — enable only if you add a `CODEOWNERS` file later)*
- [x] **Require approval of the most recent reviewable push**
- [ ] Require conversation resolution before merging *(optional; helpful if you leave review comments often)*
- **Allowed merge methods**: **Squash** only *(keeps `main` history linear; matches the `git log` pattern the agents use)*

### Require status checks to pass
- [x] **Require branches to be up to date before merging**
- [x] **Require status checks to pass**

Add these **exact** check names (copy/paste — names must match `.github/workflows/ci.yml` `name:` fields):

| Check name                       | Source                              |
| -------------------------------- | ----------------------------------- |
| `Secret Scan (gitleaks)`         | `secret-scan` job                   |
| `Backend Lint`                   | `backend-lint` job                  |
| `Frontend Lint`                  | `frontend-lint` job                 |
| `Backend Tests`                  | `backend-tests` job                 |
| `Frontend Build`                 | `frontend-build` job                |
| `E2E Smoke (Playwright)`         | `e2e-smoke` job                     |

> *If a check name doesn't appear in the autocomplete, push a commit that runs CI once so GitHub learns the name, then come back and add it.*

### Block force pushes
- [x] **Block force pushes**

### Require linear history
- [x] **Require linear history** *(matches Squash-only merge method above)*

### Require signed commits *(optional but recommended)*
- [ ] *Leave off unless every committer already has GPG/SSH signing set up — turning this on blocks unsigned commits from everyone including CI bots.*

---

## 4. Save & verify

1. Click **Create** (or **Save changes**).
2. Open any branch and try to merge a PR — you should see the status-check list appear above the merge button, all green.
3. Try force-pushing to `main` — Git should reject it with `protected branch hook declined`.

---

## 5. Notes on our CI behavior

- `retries: process.env.CI ? 2 : 1` in `playwright.config.js` means an E2E flake has up to 3 attempts before failing the whole suite. Combined with the CF warmup (`frontend/tests/global-setup.js`) this gives ~zero false-negative rate.
- `e2e-smoke` takes ~10 min. If your team ships frequently, consider raising to 2+ runners in `.github/workflows/ci.yml` (`strategy.matrix`) to parallelise desktop + mobile.
- Admin account credentials used by E2E live in **repo secrets** (`E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_BASE_URL`). If you rotate `info@carryon.us`'s password, update the secret or E2E will fail across the board. See `memory/test_credentials.md`.

---

## 6. Rollback

To disable temporarily without losing the config:
1. **Settings → Rules → Rulesets → `protect-main`**
2. Change **Enforcement status** to **Evaluate** (dry-run — logs blocks but doesn't enforce) or **Disabled**.

No code changes are needed in the repo — these are all GitHub-side settings.
