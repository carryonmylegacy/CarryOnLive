# CarryOn — Codebase Conceptual Model (Independently Re-derived)

> **Source of truth:** the *current* `/app` codebase only. No historical
> context, no prior handoff notes, no aspirational design docs were used to
> assert fact. Where the codebase contradicts an older doc, the codebase wins
> and the contradiction is flagged.
> **Re-derived:** June 2026.

---

## 0. How this differs from the prior conceptual model

The prior `carryon_platform_codebase_conceptual_model_2026-06-05.pdf` was
audited against a *local checkout* (`88e48bf` / `5eaf713`). This re-derivation
reads the deployed `/app` tree directly. The prior model is **substantially
accurate**. Corrections / additions this version makes:

- Route-policy coverage is **648/670 (96.7%)**, not 100%. The check is a
  ratchet (advisory), not an enforcing gate. (Prior model already noted this;
  re-confirmed live.)
- Account-lockout reality is **25 failed attempts inside a 5-minute window →
  5-minute lock**, NOT the "5 attempts / 15 minutes" some docs claim.
- `require_admin_scope` exists in `guards.py` but is wired into **only one
  route file** (`partner_brief.py`). No file under `routes/admin/*` enforces
  scope; admin least-privilege is effectively UI-only today.
- Subscription tiers are concretely enumerated below (prior model left them
  abstract).
- Backend route modules: **66 top-level modules** under `backend/routes/` plus
  sub-packages (`auth`, `admin`, `beneficiaries`, `estate_chat`,
  `financial_portal`, `share_cards`, `subscriptions`).

---

## 1. Prime Directive (operational invariant)

CarryOn is a **trust product**, not "a vault with AI." The single engineering
invariant: *preserve the benefactor's intent and release only the right
information, to the right people, at the right verified time.*

Consequences encoded in code:
- **Fail-closed** designation: an item with no `designated_beneficiaries` is
  released to nobody but owner/admin (`access_control._designation_matches`).
- **Email is not identity** unless `email_verified` is true — guards against an
  attacker pointing their email at a victim's address
  (`resolve_estate_actor`, `update_email` sets `email_verified=False`).
- **Offline must not white-screen** during a crisis (AuthContext paints from
  JWT/cache; error boundary handles offline chunk-load failures).

---

## 2. Product identity & promise

Family preparedness + estate readiness + legacy transfer platform. Three
layers of promise:
1. **Organization** — documents, credentials, financials, entities, plans,
   people, messages, all scoped to one estate.
2. **Controlled release** — beneficiaries see only what was designated, under
   the right phase (pre / post-transition / emergency / milestone).
3. **Guided action** — AI, checklists, contingency protocols, communications.

Positioned as **"The Family Continuity Platform"** (homepage strategy doc).

---

## 3. Roles & trust boundaries

Tenant boundary = the **estate** (`estate_id`). Roles:
- **Benefactor** (estate owner)
- **Beneficiary** (scoped, invited; a user can be both in different estates)
- **Primary beneficiary** (post-transition management powers)
- **Admin / founder** (superuser) and **Operator/staff** (narrower)
- **Trustee-Mode actor** (delegated identity acting as the benefactor; resolved
  to the benefactor user doc with `_trustee_*` flags in `get_current_user`)
- **Partner / white-label user** (`partner_slug`; partner feature gates can
  override tier visibility live)

The meaningful authorization questions (all encoded in `resolve_estate_actor`):
which estate, which role, which beneficiary record, which `release_ids`, is the
email verified, has the estate transitioned, was the item designated to this
actor, and what is the timing phase.

---

## 4. Running architecture (as deployed in `/app`)

- **Frontend:** React (CRA), React Router, Tailwind + shadcn-style components,
  PWA, Capacitor iOS/Android shell. Hosted on Vercel.
- **Backend:** FastAPI (async), Motor/MongoDB. Single `api_router` mounted at
  **both `/api` (legacy) and `/api/v1` (canonical)** (`server.py:329`).
- **DB:** MongoDB (Atlas in prod).
- **Storage:** object-storage abstraction (`services/storage.py`); local dev
  `backend/vault_storage`. Photos/credentials via S3 presigned URLs.
- **AI:** xAI / Grok via `config.xai_client` (EGA, BEC, QuickStart, CCP,
  financial summaries).
- **Email/push:** Resend; VAPID web push; Capacitor push.
- **Payments:** Stripe + Apple IAP infra retained even under platform-free mode.
- **Offline/PWA:** service worker `frontend/public/sw-push.js`; Dexie store
  (`frontend/src/offline`, **DB_VERSION = 6**); offline credential cache; outbox
  / pending-upload drain; cache clear on logout.

### Backend middleware (server.py)
- `RequestTraceMiddleware` — request IDs, structured logging, in-memory perf
  metrics.
- `SecurityHeadersMiddleware` — CSP, HSTS, X-Frame-Options DENY, nosniff,
  Referrer-Policy, **`no-store` on most `/api` responses**, request body limit.
- `RateLimitMiddleware` — Mongo-backed distributed limiting, per-token-hash
  buckets, **fail-open** on limiter failure.
- CORS — prod CarryOn origins + configured frontend URL + dev origins.

### Startup
Index setup + migrations; in-process schedulers under Mongo-backed locks
(multi-pod safe); xAI warm-up; SLA checker.

---

## 5. Domain model (collections)

`users`, `estates`, `beneficiaries`, `section_permissions`, `documents` (SDV),
`messages` (milestone), `digital_wallet` (DAV), financial collections
(`cfp_entities`, `cfp_external_people`, `cfp_entity_relationships`, accounts,
bills, debts, properties, CFP summaries), `checklists` (IAC),
`emergency_plans` / `ccp_*` (CCP), `estate_chat_*` (ECT), transition
collections (`death_certificates`, transition requests/reviews, milestone
reports/deliveries), `emergency_access`, admin/compliance collections
(security_audit_log, sensitive access logs, incidents, deletion requests,
consent_audit_log, session policies, `platform_settings`, route-policy
evidence, LLM cost ledger), `download_tokens`, `failed_logins`,
`token_blacklist`, `edit_history`.

Offline mirror (Dexie): profile, subscription, estates, beneficiaries,
dashboard, chat, vault, milestone messages, pinned docs, images, outbox,
pending uploads, offline credential.

---

## 6. Access-control model (the crown jewel: `services/access_control.py`)

Canonical **estate actor** resolution returns `release_ids` (union of user id,
verified email, beneficiary record id, beneficiary user id), role flags,
transition state, and active **emergency scopes**.

Item-level helpers (fail-closed by default):
- `can_access_document` — owner/admin always; beneficiary must be designated,
  not deleted, and pass timing/emergency rules. Essential pre-transition
  categories (living will, healthcare directive, POA variants) release pre-
  transition only when designated.
- `can_access_message` — owner/admin/operator always; beneficiary must be a
  recipient **and** delivered (per-recipient delivery via
  `build_message_delivery_update`), unless emergency `messages` scope applies.
- `emergency_scope_allows` — consumes approved emergency grant scopes.

**Legacy guards still in use** (`guards.require_estate_member/owner`,
`services/estate_auth.py`) answer "is this person in the estate?" but do **not**
encode designation, verified email, item timing, or section permissions. The
engineering rule is: beneficiary-facing data routes should prefer the canonical
actor + item/section checks. **This rule is not yet uniformly applied** (see
the companion audit — section permissions and CES credential view are the gaps).

---

## 7. Pillars & feature surfaces

**Legacy pillar:** Beneficiaries (primitive), Milestone Messages (MM),
Friends & Family Notification (FFN), Designated Trustee Services (DTS), Estate
Plan Timeline (EPT).

**Vault pillar:** Secure Document Vault (SDV), Digital Access Vault (DAV),
Estate Guardian AI (EGA).

**Financial pillar:** CarryOn Financial Picture (CFP), CarryOn Entities &
Structures (CES).

**Preparedness pillar:** Immediate Action Checklist (IAC), CarryOn Contingency
Protocols (CCP), Estate Communications Tool (ECT).

**Beneficiary-side AI:** Beneficiary Estate Concierge (BEC) — answers grounded
only in documents released to that beneficiary, with citations; hard server-
side gate in `routes/beneficiary_concierge.py`.

---

## 8. Subscriptions, free mode, feature gates, white-label

- **Plan tiers** (`subscriptions/plans.py`, `PLAN_ORDER`): `premium`,
  `standard`, `base`, `military`, `veteran`, `seniors`, `new_adult`,
  `hospice`, `enterprise`; beneficiary mirrors as `ben_*`. Family plan
  supported.
- **Platform-free mode** (`platform_settings.platform_free_mode`) →
  `get_subscription_access` returns active with reason `platform_free_mode`,
  invalidates subscription cache, bypasses payment friction **without deleting
  pricing/Stripe/IAP/feature-gate architecture**.
- **AI burn guard** (`platform_settings.ai_burn_guard_enabled`,
  `services/ai_burn_guard.py`) — caps selected AI/STT actions per user/day;
  admin & `ai_unlimited` bypass; independent of free mode.
- **White-label / B2B** — `partner_slug` drives co-branding; partner feature
  gates read **live** from `b2b_partners.feature_gates`, so partner-admin
  changes affect the cohort immediately.
- **Critical rule:** feature gates govern *visibility/route UX only*. Backend
  routes must enforce data safety independently.

---

## 9. Transition, emergency access, release timing

- Death-certificate upload/review (`transition.py`). Authoritative transition
  signal is an **approved/authenticated death certificate**, not just
  `estate.status` (which can drift) — see `section_permissions.py` double-check.
- Milestone deliveries can target specific recipient ids (per-recipient
  unlock, not global).
- **Emergency access** (`emergency_access.py`) — request → admin review →
  approve/deny/more-info; grants have duration/expiry and scopes (documents,
  messages, digital_wallet, financial_portal, connected_protocol). Document /
  message / DAV / financial item visibility consume the scopes; **CCP /
  connected_protocol routes currently do NOT consume the `connected_protocol`
  scope** (gap — see audit).

---

## 10. Offline / PWA subsystem

- **Service worker** (`sw-push.js`): pre-caches shell/logos/splash/icons/PDF
  workers; parses `index.html` + `asset-manifest.json` for hashed bundles;
  network-first navigation with cached-shell + self-contained offline fallback;
  cache-first static/images; **stale-while-revalidate for selected API GETs
  that respects `Cache-Control: no-store`**; clears API/image caches on logout.
  `CACHEABLE_API_PREFIXES` includes sensitive prefixes (`/api/documents/`,
  `/api/messages/`, `/api/checklists/`, `/api/financial/`, `/api/guardian/`) —
  safe **only because** the backend stamps those JSON responses `no-store`. A
  hard never-cache list covers auth/stripe/admin/webhook.
- **Local DB** (`offline/db.js`): Dexie `carryon-offline` v6.
- **Encryption** (`offline/crypto.js`): WebCrypto AES-GCM; key from stable
  per-device seed + user id (not the rotating JWT); encrypts non-indexed fields
  when offline encryption is on.
- **Offline credential** (`offline/offlineCredentialCache.js`): long-lived
  offline JWT encrypted with password-derived AES-GCM; no plaintext password.
- **Pinned docs** (`offline/pinnedDocsRepo.js`): explicitly pinned blobs in
  IndexedDB; fetched via authenticated `/api/documents/{id}/download` at pin
  time (server authorization preserved at pin time). **Blob-at-rest encryption
  state should be confirmed/documented** (see audit P3).
- **Auth/offline boot** (`AuthContext.js`): parallel auth/profile/subscription/
  features; paints from JWT/cache when offline; warms mirrors; drains outbox /
  pending uploads on reconnect.

---

## 11. AI surfaces

- **EGA** (`guardian*.py`) — benefactor gap-finder, IAC generator, exports;
  per-user token budgets + burn-guard surfaces.
- **BEC** (`beneficiary_concierge.py`) — resolves canonical actor, requires
  beneficiary, gated on benefactor tier `bec`, loads only docs passing
  `can_access_document`, requires citations + scrubs hallucinated markers,
  persists chat scoped by estate+user.
- **CCP AI** (`connected_protocol.py`, `ccp_depth.py`) — plan + risk-profile
  generation; burn-guard features `ccp_generate` / `ccp_risk_profile`; state-
  aware self-defense-law context with explicit non-legal-advice framing.

Safety principle: AI augments (never replaces) intent, never infers access from
UI state, and only receives server-authorized records.

---

## 12. Admin, ops, SOC2-oriented controls

Admin portal (`AdminPage.js`, `components/admin/*`, `routes/admin/*`):
users/roles, scoped admins (defined but largely unenforced at route level),
subscriptions/plans/feature-gates/trial/free-mode, partners/white-label,
platform settings (offline mode, OTP toggle, free mode, AI burn guard),
security scan + secrets inventory/self-test, audit trail + hash-chain
integrity, estate-health diagnostics, DB status, download diagnostics, ops
(support, team chat, shift scheduling, training tracker).

SOC2-oriented technical controls present: hash-chained audit
(`services/audit.py`), audit-chain status endpoint, sensitive-access logs
(`compliance.py`), GDPR export/deletion/consent, security scan
(`admin/security_scan.py`), secrets inventory + **live read-only self-tests**
(mongo/resend/stripe/aws_s3/twilio/xai), security headers + rate limits +
no-store, route-policy registry.

> **Caveat (unchanged and important):** "SOC2-aligned code controls" ≠ an
> audited SOC2 report. Several `security_scan.py` lines are **hardcoded PASS
> assertions** (lockout, blacklist, single-session, rate limits, headers),
> some with inaccurate detail strings. Evidence cadence, access reviews,
> vendor records, change-management evidence, and restore-drill records remain
> operational work.

---

## 13. Route-policy system

`route_policies.py` + `route_policies_auto.py` + `scripts/check_route_policies.py`
+ `.route_policy_baseline`. Live coverage **648/670 (96.7%)**, ratchet-style
(prevents regression below baseline; does **not** require 100%). High-value
unregistered routes today include the **trustee grant/claim flow**, `PUT
/api/auth/email`, `PUT /api/beneficiaries/{id}/flags`, admin secrets
inventory/self-test, audit-chain status, and financial-entities PDF/render.

---

## 14. Mental model (one sentence)

CarryOn is an estate-scoped trust-and-preparedness system where every feature
exists to preserve a benefactor's intent and release only the right legacy,
documents, credentials, money picture, plans, and messages to the right people
under the right verified conditions — with offline survival treated as a
product promise.
