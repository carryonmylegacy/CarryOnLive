# SOC2 Audit Responses — Audit ref `735b3b7` (CarryOn Emergent Fix Prompt)

Per-finding disposition. Items marked **ACCEPTED** or **DEVIATION (deliberate)**
are owner-approved engineering decisions with compensating controls — please do
not re-flag them as open findings without first reviewing the rationale here.
File paths are included so each claim can be verified in-tree.

---

## #1 Operator least-privilege — ✅ FIXED
- `require_scope` (`backend/guards.py`) now ENFORCES operator scope via
  `derive_operator_scopes` (operator_role `manager` → `ops_manager`, else
  `ops_team`). Operators are no longer waved through router-level scope checks.
- An `ops_team` worker is denied (403) from `finance` / `compliance` / `founder`
  / `platform_health` routers.
- `grace_periods` router → `require_scope("finance","ops_manager")`;
  `estate_health` router → `require_scope("compliance","ops_manager")`
  (`backend/routes/admin/__init__.py`).
- Evidence/tests: `backend/tests/regression/test_audit_735b3b7.py`.

## #2 Deleted-document designation finality — ✅ FIXED
- `backend/routes/documents_designate.py` loads AND mutates with
  `{"id": document_id, "deleted_at": None}`. A soft-deleted document returns 404
  before any mutation or share-notification fires.

## #3 Sensitive offline cache at rest — ⚠️ PARTIAL (residual ACCEPTED by owner, Jun 9 2026)
### Implemented
- **Pinned SDV document blobs are fail-closed** (`frontend/src/offline/pinnedDocsRepo.js`
  + `crypto.js::sealBlobForce`): sensitive document bytes (wills, POAs,
  credentials) are AES-256-GCM sealed before touching IndexedDB and are REFUSED
  (never stored in plaintext) if a key cannot be derived.
- **DAV secrets never cached**: password / `additional_access` / free-text
  `notes` are stripped by an allowlist sanitizer before any cache write, with a
  boot-time self-healing purge of legacy rows.
- **Corrected misleading comments** that claimed DevTools/disk attackers cannot
  read the encrypted data (the device seed + bearer token are co-located in
  localStorage, so a full-profile-read attacker can re-derive the key — comments
  now state this accurately).

### NOT implemented — ACCEPTED RISK (do not re-flag; see `docs/SOC2_RISK_REGISTER.md` RISK-001)
- **Encrypting the financial / beneficiary / checklist / CCP / DTS / FFN
  list-cache *metadata* in localStorage** was intentionally NOT done.
- **Reasoning:**
  1. *Mutually exclusive with a deliberate product requirement.* These caches
     are read **synchronously at React component-init** to seed `useState` for a
     zero-skeleton instant-paint on offline cold-boot. Browser WebCrypto is
     **async-only** (no synchronous AES), so encrypting them forces those reads
     to `await`, which removes instant-paint — a real, user-visible regression of
     an intentional behavior.
  2. *Marginal security gain.* The encryption key is itself derived from
     localStorage (`carryon_enc_seed_v1` device seed + `carryon_token`). An
     attacker with localStorage/disk read access already holds BOTH the
     ciphertext and the key material, so encrypting a localStorage blob with a
     localStorage-derived key defeats only casual plaintext grepping, not a real
     device-access attacker.
- **Net residual exposure:** only **non-credential display metadata** (names,
  balances, due dates) sits in plaintext, on a device the user already controls.
  The two genuinely-sensitive offline payloads are BOTH encrypted at rest:
  credential bytes (pinned documents, fail-closed) and raw write bodies (the
  sync outbox, universal encryption). 
- **Status:** ACCEPTED for the current SOC2 cycle by the platform owner.
  Remediation (if ever reclassified) is a dedicated cached-skeleton +
  async-decrypt refactor, tracked ROADMAP P2.

## #4 Deletion purge gap (latest-pdfs) — ✅ FIXED
- `backend/services/estate_purge.py::purge_user_storage` now purges
  `latest-pdfs/{user_id}/` (cached QuickStart / binder PDFs) in addition to
  `photos/users/{user_id}/`, BEFORE the user DB row is removed.

## #5 SOC2 readiness enforceability — ✅ FIXED via the "separate hard gate" option (DEVIATION from the 503 option — deliberate)
- The finding explicitly offered an OR: **(a)** restore `production_readiness`
  violations as hard **503** failures on `/health/ready`, **OR** **(b)** create a
  **separate hard deploy/monitor gate**. We implemented **(b)**, NOT (a), by
  owner directive.
- **Why NOT (a):** `/health/ready` is the liveness/readiness probe the
  orchestrator uses to route traffic. Returning 503 there for a missing
  background job or a log-config flag would pull a *healthy, serving* pod out of
  rotation — an availability outage caused by a non-availability control. The
  owner explicitly rejected coupling availability to these checks.
- **What IS enforced (the hard gate):** `GET /api/admin/soc2-readiness`
  (compliance-scoped; `backend/routes/admin/soc2_readiness.py` +
  `backend/services/production_readiness.py::production_readiness_report`)
  returns a hard pass/fail covering **REDACT_PII=1, LOG_FORMAT=json, the full
  security-middleware stack, required schedulers healthy, AND staff session
  policies enabled**. Startup additionally logs CRITICAL for any violation. This
  endpoint is designed to back a production uptime/alert monitor that pages on
  `ok: false` — i.e., it BLOCKS/ALERTS production when a required control is
  inactive, without risking an availability outage.
- `/health/ready` surfaces the same violations as **ADVISORY** (it does NOT 503
  on them; only a MongoDB outage 503s readiness). `production_readiness.py` module
  docstring is aligned with this `server.py` behavior.
- **Auditor note:** readiness IS enforceable — please verify against the
  `/api/admin/soc2-readiness` hard gate + startup CRITICAL logging, not against
  `/health/ready` returning 503.

## #6 Deploy evidence — ✅ FIXED
- `.github/workflows/ci.yml` triggers on every push to `main` (including
  Emergent auto-commits). The `deploy-gate` job passes only when **all** required
  checks are green and `RUN_E2E == true`, and it writes + uploads the
  `soc2-deploy-evidence` artifact (90-day retention) for each production commit.
- Production deploy now **waits for the gate**: Vercel git auto-deploy is
  disabled (`frontend/vercel.json` → `git.deploymentEnabled.main: false`), Render
  Auto-Deploy is Off, and both deploy ONLY via a Deploy Hook fired from the
  `deploy-gate` job under `if: success()` — so neither can deploy ahead of CI.
- The `main` branch protection ruleset requires the **SOC2 Deploy Gate** status
  check (with restrict-deletions + block-force-pushes; admin bypass exists only
  so Emergent's direct-to-main pushes aren't blocked, and those still run the
  gate before deploy).
