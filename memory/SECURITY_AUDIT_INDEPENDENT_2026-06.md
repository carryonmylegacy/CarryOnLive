# CarryOn — Independent Verification of the Beneficiary / SOC2 Audit + Fix Plan

> **Method:** Each finding in `carryon_beneficiary_security_soc2_audit_2026-06-05.pdf`
> was re-checked against the **current `/app` codebase** (not the audit's local
> checkout). Verdicts: **CONFIRMED**, **CONFIRMED (worse than reported)**,
> **PARTIAL**, or **NOT REPRODUCED**. Evidence is cited to live files/lines.
> **Reviewed:** June 2026.

## Verdict summary

| # | Finding | Sev | Verdict |
|---|---------|-----|---------|
| 1 | Section permissions not enforced server-side | P1 | **CONFIRMED** |
| 2 | CES entities beneficiary-view over-exposes linked DAV credentials | P1 | **CONFIRMED** |
| 3 | No direct-API beneficiary penetration test suite | P1 | **CONFIRMED** |
| 4 | Download tokens store full user document | P2 | **CONFIRMED** |
| 5 | Route-policy coverage 648/670, ratchet only | P2 | **CONFIRMED** (exact) |
| 6 | `section_permissions` trusts unverified email | P2 | **CONFIRMED** |
| 7 | Admin scoped roles not enforced at route level | P2 | **CONFIRMED (worse)** |
| 8 | Emergency scopes lack endpoint coverage (CCP) | P2 | **CONFIRMED** |
| 9 | SOC2 evidence docs stale / overbroad | P2 | **CONFIRMED (worse)** |
| 10 | SW API cache must stay fail-closed | P3 | **CONFIRMED (drift risk)** |
| 11 | Offline pinned-doc data-at-rest threat model | P3 | **PARTIAL** |
| 12 | Security scan hardcoded PASS | P3 | **CONFIRMED** |

What the audit credited as *already strong* (centralized `resolve_estate_actor`,
verified-email guard, fail-closed designation, per-recipient message delivery,
`can_access_document`-grounded BEC, DAV assignment+timing, financial item
filtering, no-store API headers, offline white-screen protections) was **also
verified true** in the current tree. No new stranger-IDOR on core
document/message/BEC routes was reproduced.

---

## Confirmed findings — evidence & fix plan

### P1-1 — Section permissions are UX-only on the backend  **CONFIRMED**
**Evidence:** `routes/checklist.py` — `GET /checklists/{estate_id}` and
`PATCH /checklists/{item_id}/toggle` both use `require_estate_member` only;
neither consults `section_permissions.sections["checklist"]`. The
`section_permissions` collection + `ALL_SECTIONS`
(`vault, messages, checklist, guardian, digital_wallet, timeline,
financial_portal`) exist, but data routes don't enforce them. The frontend
`TransitionGate.js` hides sections; the API still answers.
**Impact:** Over-grant relative to benefactor/primary-beneficiary intent. A
beneficiary whose section is toggled off can still read/mutate via direct API.
**Fix:**
1. Add to `services/access_control.py`:
   `resolve_beneficiary_section_access(actor, section_key)` and
   `require_beneficiary_section_access(actor, section_key)` — owner/admin
   bypass; beneficiary requires `sections[section_key] != False`; default
   fail-closed; return empty/404 for list reads, 403 for explicit denials.
2. Apply route-by-route, **checklist first**, then messages, documents,
   digital_wallet, financial_portal, connected_protocol/ccp_depth, timeline,
   and estate_chat (if ECT is meant to be section-gated).
3. Keep essential-pre-transition-doc exceptions explicit and narrow.
**Regression risk:** Medium (many surfaces). Ship helper + tests first, then
roll out. Owners/admins and pre-transition essential docs must not break.

### P1-2 — CES beneficiary view leaks unassigned linked credentials  **CONFIRMED**
**Evidence:** `routes/financial_portal/entities_share.py` —
`_credential_is_visible()` filters only on `beneficiary_visibility` +
transition state; it does **not** check `assigned_beneficiary_id` against
`actor.release_ids`. Contrast `routes/digital_wallet.py::_entry_assigned_to_actor`
which *does*. `_credential_for_beneficiary()` returns `account_name`,
`login_username`, `password` (legacy plaintext field), `additional_access`,
`notes`, `linked_entity_id`.
**Impact:** Strongest remaining beneficiary over-exposure. Any beneficiary
allowed to see the entities chart receives **every** linked credential marked
`show_now`/`posthumous_only`, regardless of assignment. Modern passwords live
in `encrypted_password` (not returned here), but username/notes/additional/
linkage and any legacy plaintext still leak.
**Fix:**
1. In `entities_share.py`, gate each credential on assignment first
   (mirror DAV `_entry_assigned_to_actor`), **then** visibility timing.
2. Only decrypt/return fields after assignment + visibility pass; drop the raw
   `password` passthrough (decrypt `encrypted_password` only when authorized,
   matching DAV behavior — or omit secrets entirely from the chart view).
3. If product intent is "seeing the entity releases its credentials to all
   allowed viewers," make that an **explicit separate flag**, not implicit.
4. Default fail-closed.
**Regression risk:** Low–medium (narrows exposure). Owner/admin preview must
still show all.

### P1-3 — No direct-API beneficiary penetration suite  **CONFIRMED**
**Evidence:** `backend/tests/` exists but has no A-vs-B beneficiary IDOR matrix
hitting APIs directly.
**Fix:** Build pytest suite under `backend/tests/` seeding owner, beneficiary
A, beneficiary B, unrelated user, pre/post-transition estates, primary
beneficiary, section-disabled beneficiary, emergency-scope beneficiary. Assert
the full matrix (SDV pre/post + empty designation + download, messages +
partial-delivery, BEC context, DAV, **CES after P1-2 fix**, CFP, checklist +
section-disabled after P1-1, emergency scope expiry, unverified-email
non-inheritance, route-policy completeness). Lock behavior **before** broad
rollout.
**Regression risk:** Low.

### P2-4 — Download tokens store the full user document  **CONFIRMED**
**Evidence:** `services/download_tokens.py::create_token` stores
`{k: v for k, v in user.items() if k != "_id"}`; `user` is the full
`get_current_user` doc (password hash, OTP state, offline-cred metadata, admin
scope, profile). No Mongo TTL index (manual `delete_many` per create).
**Fix:**
1. Store a minimal snapshot: `id, email, role, name, admin_scope,
   operator_role, is_also_benefactor, is_also_beneficiary, email_verified`,
   plus trustee flags if TMA downloads need them. (Verified the
   `downloads.py` handlers only consume identity/role.) Alternatively store
   `user_id` and re-resolve on consume.
2. Add a Mongo **TTL index** on `created_at` (expireAfterSeconds = 300) in the
   index-setup migration.
3. Add a unit test asserting no `password`/OTP/offline fields ever land in a
   `download_tokens` row.
**Regression risk:** Low (test each download action).

### P2-5 — Route-policy coverage 648/670 (96.7%), ratchet only  **CONFIRMED**
**Evidence:** `python scripts/check_route_policies.py` → `648/670 (96.7%)`,
advisory (non-blocking). Unregistered high-value routes include the trustee
grant/claim flow, `PUT /api/auth/email`, `PUT
/api/beneficiaries/{id}/flags`, `GET /api/admin/audit-chain-status`, secrets
inventory/self-test, `GET/POST /api/financial/entities/{id}/pdf|render-pdf`,
`/api/our-promise`, onboarding/estate-binder skip routes, `GET
/api/verify/{token}`.
**Fix:** Register all currently-unregistered routes in
`route_policies(_auto).py`; update `.route_policy_baseline`; then convert the
gate to **require full coverage for sensitive buckets** (admin, auth, trustee,
beneficiary, documents, messages, financial, digital_wallet, transition,
emergency_access).
**Regression risk:** Low (inventory-only; no runtime change).

### P2-6 — `section_permissions` trusts unverified email  **CONFIRMED**
**Evidence:** `routes/section_permissions.py::get_my_section_permissions`
builds the beneficiary lookup with
`current_user["email"].lower().strip()` and **no** `email_verified` check,
while `resolve_estate_actor` only trusts email when verified, and
`update_email` correctly sets `email_verified=False`.
**Fix:** Reuse `resolve_estate_actor` here (preferred), or add email to the
`$or` only when `current_user.get("email_verified")`. Keep 404/403 consistent
for non-beneficiaries.
**Regression risk:** Low (intended anti-impersonation; user must reverify).

### P2-7 — Admin scoped roles not enforced at route level  **CONFIRMED (worse than reported)**
**Evidence:** `guards.py::require_admin_scope` exists, but it is referenced by
**only `routes/partner_brief.py`** — **zero** files under `routes/admin/*` use
it; 19/24 admin route files use broad `require_admin`/`require_staff`. So
finance/compliance/marketing/platform-health/founder separation is UI-only.
**Fix:** Wire scope dependencies into admin families:
- finance: subscriptions, plans, revenue, grace periods, exports
- compliance: audit trail, security scan, audit-chain, deletion requests,
  incidents, estate-health diagnostics
- marketing: funnel, partner brief, founder invites, site content, beta
- platform-health: DB status, code health, secrets inventory/self-test,
  integrations, maintenance
- founder-only: platform OTP/free-mode/burn-guard toggles, IP whitelist, role
  changes, scoped-admin CRUD, destructive bulk ops
Preserve a founder override and normalize legacy `admin_scope` shapes
(string vs list — `profile.py` already normalizes for the UI).
**Regression risk:** Medium (some admin accounts may lack scope arrays —
backfill founder scope first).

### P2-8 — Emergency scopes lack CCP endpoint coverage  **CONFIRMED**
**Evidence:** `access_control.emergency_scope_allows` supports a
`connected_protocol` scope and DAV/docs/messages/financial consume their
scopes, but `routes/connected_protocol.py` (and `ccp_depth.py`) contain **no**
`emergency_scope` usage — access is estate-membership / per-plan only.
**Fix:** Build a scope→endpoint matrix; decide the product rule (are ordinary
beneficiaries always allowed CCP for preparedness, or only assigned/section-
enabled?), then encode it server-side and add per-scope expiry tests. Be
careful **not** to block legitimate emergency preparedness access.
**Regression risk:** Medium.

### P2-9 — SOC2 evidence docs stale / overbroad  **CONFIRMED (worse than reported)**
**Evidence:**
- `memory/SECURITY_POSTURE.md` claims `100% (629/629 routes registered)`;
  live is **648/670 (96.7%)**.
- `docs/data-handling.md` line 34 claims **"5-attempt lockout / 15-minute
  window"** and `security_scan.py` claims **"5 failed attempts within 15
  minutes"** — but `routes/auth/login.py` actually locks after **25 failures
  in a 5-minute window for 5 minutes**. Both the threshold (25 vs 5) and the
  window (5 vs 15 min) are wrong.
- `docs/data-handling.md` line 105 states **"SOC 2 ready — all five Trust
  Service Criteria are covered."**
**Fix:**
1. Correct `SECURITY_POSTURE.md` route count (or mark historical).
2. Correct lockout copy to the real policy (and separately decide whether
   25/5min is the *intended* policy — it is weaker than advertised).
3. Replace "SOC 2 ready / all five criteria covered" with **"SOC2-aligned
   controls implemented; evidence collection in progress."**
4. Add a SOC2 evidence index (control ID, owner, cadence, source, last
   reviewed).
**Regression risk:** Low (docs/admin copy).

### P3-10 — SW API cache must stay fail-closed  **CONFIRMED (drift risk)**
**Evidence:** `sw-push.js` `CACHEABLE_API_PREFIXES` includes `/api/documents/`,
`/api/messages/`, `/api/checklists/`, `/api/financial/`, `/api/guardian/`;
`staleWhileRevalidate` skips `no-store` responses; middleware stamps `no-store`
on those routes. Safe **today**, but a future route-level cache header would
silently make sensitive JSON cacheable.
**Fix:** Add an invariant test asserting authenticated sensitive JSON routes
return `Cache-Control: no-store`; optionally add an explicit SW denylist for
documents/messages/financial JSON. Keep logout cache-clear.
**Regression risk:** Low (test/invariant).

### P3-11 — Offline pinned-doc data-at-rest threat model  **PARTIAL**
**Evidence:** Pinned blobs stored in IndexedDB (`pinnedDocsRepo.js`);
`offline/crypto.js` AES-GCM exists for non-indexed fields; logout/public-device
purge exists. Whether pinned **blobs** themselves are encrypted at rest is not
clearly established in code and should be confirmed.
**Fix:** Confirm/encrypt pinned blobs at rest (or explicitly document the
threat model + add a settings "remove offline data from this device" control);
audit-log pin/unpin; ensure offline-credential revocation purges on next online
contact; add public-device-mode purge tests.
**Regression risk:** Medium if encrypting blobs; low for warnings/audits.

### P3-12 — Security scan emits hardcoded PASS  **CONFIRMED**
**Evidence:** `routes/admin/security_scan.py` hardcodes `PASS` for token
blacklisting, single-session, account lockout (with the wrong "5/15min"
detail), rate-limit tiers, every security header, encryption, password hashing,
retention — none are live-measured. (Index checks and external-service
self-tests *are* live.)
**Fix:** Introduce check types `LIVE_PASS | CONFIG_PASS | MANUAL_REQUIRED |
WARN | FAIL`; read real constants (lockout/rate-limit), verify TTL indexes for
retention claims, verify recent chained audit entries for audit-logging, and
link each check to a source file/runtime query.
**Regression risk:** Low.

---

## Recommended fix order (audit's order, validated)

1. **P1-2** CES credential assignment check (highest data-leak severity, low
   risk).
2. **P1-3** Direct beneficiary penetration tests (locks behavior before broad
   change).
3. **P1-1** Backend section-permission helper → checklist first, then roll out.
4. **P2-4** Minimize download-token snapshot + TTL index + test.
5. **P2-5** Register missing route policies; tighten gate for sensitive buckets.
6. **P2-6** `section_permissions` → canonical actor resolution.
7. **P2-7** Route-level admin scope on highest-risk admin endpoints.
8. **P2-8** Emergency scope→endpoint matrix + tests.
9. **P2-9 / P3-12** Correct SOC2 docs + make security scan measured.
10. **P3-10 / P3-11** Offline cache invariant + pinned-doc threat model.

## Bottom line
The audit is **accurate and unbiased**; every material finding reproduces
against the current codebase, and two (admin scope, SOC2 doc accuracy) are
**worse** than the PDF stated. The fixes are surgical — no need to disturb
paywall, white-label, offline, admin, or AI architecture. The single most
important data-safety fix is **P1-2 (CES credential assignment)**; the single
most important credibility fix is **P2-9 (lockout copy + SOC2 claim wording)**.
