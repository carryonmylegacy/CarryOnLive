# SOC2 Audit Responses — Audit ref `3153523c0f41315e0c7399721634a3c5ff2953ee`

Scope: SOC2 / beneficiary access / offline / deploy gate regression pass.
Per-finding disposition. File paths included so each claim can be verified
in-tree. All four findings were **implemented** — none conflicted with the PRD
Prime Directive. Two carry deployment context notes (the founder must mirror the
non-secret values in the Render dashboard, since Render only reads `render.yaml`
on Blueprint sync).

---

## #1 (P1) Production SOC2 controls inert on Render unless a prod env var is set — ✅ FIXED
- `render.yaml` now sets the non-secret production controls directly in the
  service `envVars`:
  - `ENVIRONMENT=production` (arms `is_production()` → disables `/api/docs` +
    `/api/openapi.json`, activates the readiness gate)
  - `REDACT_PII=1`
  - `LOG_FORMAT=json`
- **Operator action required (founder):** set the SAME three values in the
  Render dashboard → Service → Environment. Render only re-reads `render.yaml`
  on a Blueprint sync; the dashboard is the runtime source of truth.
- **Regression:** `backend/tests/regression/test_audit_3153523.py`
  - `test_render_yaml_sets_production_controls` (static presence)
  - `test_production_readiness_report_fails_closed_when_controls_absent`
    (asserts `production_readiness_report()` returns `ok=false` with REDACT_PII +
    LOG_FORMAT violations when `ENVIRONMENT=production` and the controls are absent).

## #2 (P1) Dedicated scheduler-worker trusted without proof it is alive — ✅ FIXED
- `backend/scheduler_worker.py` now writes durable per-scheduler heartbeats to
  Mongo (`scheduler_heartbeats`): `worker_id`, `scheduler_name`, `status`
  (`starting`/`running`/`standby`/`error`), `last_seen_at`, `last_success_at`,
  `last_error`, `first_seen_at`. A dedicated `_heartbeat_writer` task refreshes
  every 60s; `_locked_loop` updates each scheduler's status (and `last_error` on
  crash).
- `backend/services/production_readiness.py::worker_heartbeat_violations()` is
  now folded into the hard report. When `DISABLE_INPROC_SCHEDULERS=1`
  (dedicated-worker topology) it **FAILS CLOSED**: every `REQUIRED_SCHEDULERS`
  entry (`data_retention`, `milestone_delivery`, `grace_period`,
  `billing_lifecycle`) must have a heartbeat that is present, non-`error`, and
  fresher than `WORKER_HEARTBEAT_STALE_SECONDS` (300s) — otherwise
  `GET /api/admin/soc2-readiness` returns `ok=false`.
- **Context note (not a softening):** production currently runs schedulers
  **in-process** (no `DISABLE_INPROC_SCHEDULERS` set on Render), so the existing
  synchronous `scheduler_violations()` already covers today's topology. The
  heartbeat enforcement is the missing guard that arms automatically the moment
  the platform flips to the dedicated-worker pod. It is intentionally inert in
  in-proc mode to avoid double-counting.
- **Regression:** `test_worker_heartbeats_inert_outside_worker_mode` and
  `test_worker_heartbeats_enforced_in_worker_mode` (fresh → ok; missing → fail;
  stale → fail).

## #3 (P2) `render.yaml` still allowed backend auto-deploy on every push — ✅ FIXED
- `render.yaml` is now `autoDeploy: false` with a comment stating that
  production releases happen ONLY via the Render Deploy Hook fired by
  `.github/workflows/ci.yml` after the **SOC2 Deploy Gate** passes, and that the
  dashboard "Auto-Deploy = No" is the runtime source of truth. The conflicting
  "redeploys on every push" claim is removed.
- **Regression:** `test_render_yaml_autodeploy_disabled`.

## #4 (P2) Profile/subscription IndexedDB mirrors could store plaintext — ✅ FIXED
- **ProfileRepo** (`frontend/src/offline/repos/profileRepo.js`): the full
  `/auth/me` snapshot (`data`) is now force-encrypted via `sealRecordForce`
  (device-seed key path, flag-agnostic) into an `__enc` blob. Only display
  identity fields (`id`, `email`, `name`, `first_name`, `last_name`,
  `photo_url`) remain plaintext for instant offline paint. **FAILS CLOSED:** when
  no key can be derived, only the display-only row is persisted — the sensitive
  snapshot is never written in plaintext. Legacy plaintext rows self-heal
  (re-seal) on read.
- **SubscriptionRepo** (`frontend/src/offline/repos/subscriptionRepo.js`): the
  payload (`data`, incl. Stripe identifiers + trial dates) is force-encrypted the
  same way. **FAILS CLOSED:** no key → the mirror is purged/not written (re-fetched
  online). Legacy plaintext rows self-heal/purge on read.
- This removes the residual gap: full profile + subscription mirrors are no
  longer plaintext-at-rest even for users who never enabled offline mode. (The
  previously **accepted** risk in `SOC2_RISK_REGISTER.md` RISK-001 — synchronous
  list-cache *metadata* — is unchanged and still accepted; it is a different
  surface from these full IndexedDB mirrors.)
- **Regression:**
  - Static guard in `test_audit_3153523.py`
    (`test_profile_repo_uses_force_encryption`,
    `test_subscription_repo_uses_force_encryption`).
  - Behavioral Jest test
    `frontend/src/offline/repos/__tests__/offlineRepos.test.js` (real WebCrypto +
    in-memory Dexie fake; asserts `__enc` present, no plaintext PII, round-trip).
  - **Browser-verified (Jun 9 2026):** logged in on the preview pod with offline
    mode OFF, read IndexedDB `carryon-offline` → `user.current` and
    `subscription.current` both had `__enc` and no plaintext `data` blob;
    profile kept only display identity fields plaintext.

---

*Auditor note:* none of these fixes weakened any existing control. #1 and #3
require the founder to confirm matching values/settings in the Render dashboard
(documented above) because the live Render config — not the committed YAML — is
authoritative at runtime.
