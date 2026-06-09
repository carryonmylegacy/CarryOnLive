# Render Environment Inventory — Source of Truth

**Why this file exists:** The Render dashboard is the runtime source of truth for
the backend's environment, but its values are masked/secret and **never sync back
into the repo**. Without a record, agents (and audits) have to guess what's set
live. This file is that record. Keep it current whenever a Render env var is
added, removed, or its expected value changes.

> ⚠️ NEVER paste secret VALUES here. Secrets are listed by KEY only, with a
> "set on Render?" status. Only non-secret values are written out in full.

---

## Service facts (from the Render dashboard)

| Field | Value |
|---|---|
| Service name | `carryon-api-kacr` |
| Service ID | `srv-d86h62d7vvec73a7od00` |
| Type / runtime | Web Service · Docker · **Blueprint managed** |
| Plan / region | Standard · Virginia |
| Repo / branch | `carryonmylegacy/CarryOnLive` · `main` |
| Public URL | https://carryon-api-kacr.onrender.com (API base `…/api`) |
| Auto-Deploy | **No** (deploy-hook-only; fired by `.github/workflows/ci.yml` after the SOC2 Deploy Gate). Mirrored in `render.yaml` → `autoDeploy: false`. |
| Blueprint | `render.yaml` at repo root. Render applies `value:` keys + settings on Blueprint sync. |

---

## Non-secret config (values are authoritative — `value:` in `render.yaml`)

| Key | Expected value | Set on Render? | Notes |
|---|---|---|---|
| `PORT` | `10000` | ✅ (assumed via blueprint) | Render container port. |
| `PYTHONUNBUFFERED` | `1` | ✅ | Unbuffered stdout for live logs. |
| `VAPID_PRIVATE_KEY_PATH` | `/app/vapid_private.pem` | ✅ confirmed in dashboard | Path written at boot by docker-entrypoint. |
| `VAPID_PUBLIC_KEY_PATH` | `/app/vapid_public.pem` | ✅ confirmed in dashboard | " |
| `ENVIRONMENT` | `production` | ✅ **confirmed live (Jun 9 2026)** | Arms `is_production()` → disables `/api/docs`, activates the hard SOC2 readiness gate. |
| `REDACT_PII` | `1` | ✅ **confirmed live (Jun 9 2026)** | SOC2 logging control. |
| `LOG_FORMAT` | `json` | ✅ **confirmed live (Jun 9 2026)** | SOC2 logging control. |

> The three SOC2 controls were confirmed present on Jun 9, 2026 when a manual
> re-add attempt returned "Duplicate key not allowed" — i.e. they already exist
> on the live service. (audit 3153523 #1 — satisfied on the live service.)

---

## Secrets (KEY only — values live ONLY in the Render dashboard, `sync: false`)

| Key | Set on Render? | Notes |
|---|---|---|
| `MONGO_URL` | ✅ | MongoDB Atlas connection string. |
| `DB_NAME` | ✅ | Database name (do not rename). |
| `JWT_SECRET` | ✅ | 64-char HMAC secret (rotate per `test_credentials.md`). |
| `ENCRYPTION_KEY` | ✅ | App-layer encryption key. |
| `CORS_ORIGINS` | ✅ | Allowed origins. |
| `FRONTEND_URL` | ✅ | Public frontend origin. |
| `EMERGENT_LLM_KEY` | ✅ | Emergent universal LLM key. |
| `XAI_API_KEY` | ✅ confirmed in dashboard | xAI Grok. |
| `XAI_TEAM_ID` | ✅ confirmed in dashboard | xAI team. |
| `STRIPE_API_KEY` | ✅ | Stripe live key. |
| `RESEND_API_KEY` | ✅ | Resend email. |
| `SENDER_EMAIL` | ✅ | From-address for Resend. |
| `TWILIO_ACCOUNT_SID` | ✅ | Twilio SMS. |
| `TWILIO_AUTH_TOKEN` | ✅ | " |
| `TWILIO_PHONE_NUMBER` | ✅ | " |
| `APPLE_SHARED_SECRET` | ✅ confirmed in dashboard | Apple IAP receipt validation. |
| `AWS_ACCESS_KEY_ID` | ✅ confirmed in dashboard | Emergent-managed S3 (bucket `carryon-vault`). |
| `AWS_SECRET_ACCESS_KEY` | ✅ confirmed in dashboard | " |
| `VAPID_PRIVATE_KEY_PEM` | ✅ confirmed in dashboard | Web Push private key (PEM contents). |
| `VAPID_PUBLIC_KEY_PEM` | ✅ confirmed in dashboard | Web Push public key (PEM contents). |
| `VAPID_CLAIMS_EMAIL` | ✅ | Web Push contact. |
| `DEMO_REVIEW_EMAIL` | optional | App-review demo account. |
| `DEMO_REVIEW_OTP` | optional | App-review demo OTP. |

> Keys NOT present in production (preview-only, must NEVER be set on Render):
> `SEED_E2E_ACCOUNT`, `E2E_SEED_PASSWORD` (predictable-credential E2E account).
> `DISABLE_INPROC_SCHEDULERS` is currently **unset** on Render → schedulers run
> in-process. Only set it to `1` when a dedicated scheduler-worker pod (with
> Mongo heartbeats) is deployed; the SOC2 readiness gate then enforces those
> heartbeats. (audit 3153523 #2)

---

## How to keep this current
- Add/remove an env var on Render → update the matching row here in the same change.
- Adding a **non-secret** key? Put it in `render.yaml` with a `value:` AND list it
  here with the value, so it's reproducible on a fresh Blueprint sync.
- Adding a **secret**? Add to `render.yaml` with `sync: false`, set the value in
  the dashboard, and add a KEY-only row here (never the value).
- "Set on Render?" `✅ confirmed in dashboard` = visually verified in the UI.
  `✅` (no qualifier) = declared in `render.yaml`/expected but not independently
  re-verified in the dashboard this session.

*Last reviewed: Jun 9, 2026 (audit 3153523).*
