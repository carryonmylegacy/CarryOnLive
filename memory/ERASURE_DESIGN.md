# CarryOn — Erasure Service: Collection Inventory + Design (Sep 1, 2026)

Status: DESIGN FOR FOUNDER APPROVAL — no code written. Source of truth for the erasure build.
Inventory taken from the live preview schema (175 collections) cross-checked against every
`db.<coll>.insert/update` in `routes/`, `services/`, `server.py`, `schedulers.py`.

## 0. Findings that change the picture

1. **A self-service deletion button already exists and is broken.** Settings → Privacy → "Request
   account deletion" → `POST /compliance/deletion-request` writes `deletion_requests` and tells the
   user *"Your account and all associated data will be permanently deleted within 30 days. You will
   receive confirmation via email."* Nothing processes the collection (only counted as
   `pending_deletions` on the admin dashboard); no email is sent. Any production request older than
   30 days is already outside GDPR Art. 12(3). Founder: check Admin → Analytics `pending_deletions`
   on production.
2. It also **blocks** deletion when any estate has an accepted beneficiary — an obstacle GDPR Art.
   12(2) does not permit; CCPA likewise. Replace with impact-acknowledgement.
3. **No erasure executor exists.** Admin user-delete covers ~25 of ~110 personal-data collections;
   benefactor estate-delete covers 6. `routes/estates.py` deletes from a phantom `activity_logs`
   collection — the real one is `activity_log`.
4. **Retention controls promised by `GET /compliance/retention-policy` are not all real:** `otps`
   stores the **plaintext OTP** and its TTL index never fires because `created_at` is a string (823
   rows since Feb on preview); `failed_logins` has no TTL (policy says 1 h); `webauthn_challenges`,
   `client_errors` (IP + UA), `funnel_sessions` (IP + demographics), `chunked_uploads` have no TTL.
5. `binder_shares` public share tokens survive estate deletion today.
6. Milestone messages: grace-period code says "NEVER purged" (that is a *subscription-lapse* rule);
   an Art. 17 erasure by the living benefactor must still delete them — see decision D3.

## 1. Legal frame used for every RETAIN

- GDPR Art. 17(1) erasure; exceptions Art. 17(3)(b) legal obligation, 17(3)(e) legal claims;
  Art. 12(3) respond within one month; Art. 12(2) facilitate, no obstacles; Art. 7(1) prove consent;
  Art. 5(2) accountability; Art. 33(5) document breaches; Art. 19/28 instruct processors; Art. 20
  portability (offer export first).
- CCPA §1798.105 right to delete; exceptions §1798.105(d)(1) complete transaction, (d)(2) security
  incidents/fraud, (d)(3) debug, (d)(8) legal obligation, (d)(9) internal uses aligned with
  expectations; §1798.130(a)(2) 45 days; §1798.105(c) direct service providers; CCPA Regs §7022
  two-step online deletion; §7101(a) keep request records 24 months.
- US tax/accounting: 26 U.S.C. §6001 + IRS record-keeping (7 years used, matches published policy).
- SOC 2 CC7.2/CC7.3 logging commitments (contractual, backs the legitimate-interest basis).

Retention periods below reuse the already-published policy (`/compliance/retention-policy`) so
the build does not contradict what users have been told. Where I recommend shortening, it is a
founder decision (D6).

## 2. Inventory — action on ERASURE of a user (and of a single estate where E-scoped)

Legend: **E** estate-scoped · **U** user-keyed · **UC** user content · **UP** profile/auth ·
**RL** relationship · **OP** operational telemetry · **SEC** security/audit · **FIN** financial ·
**STAFF** staff/HR · **PLAT** platform config · **PROSPECT** no-account personal data · **EPH** ephemeral.

### 2a. DELETE (user content, profile, relationships) — 104 collections

| Collection | Scope | Class | Notes |
|---|---|---|---|
| users | U | UP | root; replaced by pseudonymous erasure receipt (sha256 email) |
| estates | E | UC | root for estate cascade |
| documents (+ objects) | E | UC | storage: `estates/{id}/` prefix (purge_estate_storage) |
| vault_items | E | UC | legacy |
| document_pins | E/U | UC | |
| checklists | E | UC | |
| messages (+ media) | E | UC | D3 |
| milestone_deliveries | E | UC | D3 |
| milestone_reports | E | RL/UC | proof_data, beneficiary_id — D3 |
| death_certificates (+ objects) | E | UC | transitioned estates: admin-only path |
| dts_tasks | E | UC | |
| digital_wallet | E | UC | DAV secrets — highest sensitivity |
| financial_accounts, bills, bill_payments, bill_categories, debts, property_assets | E | UC | CFP |
| cfp_entities, cfp_entity_relationships, cfp_external_people, cfp_beneficiary_blocks, cfp_chart_layouts | E | UC | CES; external_people = third-party contacts |
| emergency_plans, emergency_activations, member_checkins, ccp_plans, ccp_risk_profile, ccp_household, ccp_go_bag, ccp_rendezvous, ccp_out_of_area, ccp_drill_runs, ccp_activations | E | UC | CCP |
| ffn_contacts | E | UC | third-party emails |
| estate_channels, estate_messages (+ media) | E | UC | ECT |
| estate_channel_reads, estate_channel_dismissals, estate_reactions, estate_typing | U | UP/EPH | |
| ega_tasks | E/U | UC | |
| chat_history, beneficiary_concierge_messages | E+U | UC | done (transcript_purge) |
| edit_history, readiness_history, activity_log | E/U | UC/OP | activity_log currently never cascaded (phantom `activity_logs`) |
| cached_pdfs, latest_pdfs (+ objects), pdf_verification_snapshots | E/U | UC | `latest-pdfs/{user}/` prefix |
| beneficiaries | E | UC+RL | third-party PII (DOB, SSN-4, address, notes) — deleted with estate; beneficiary self-erasure → D2 |
| beneficiary_estates, family_connections (+ photo objects), family_plan_requests, family_plans (membership), access_requests, emergency_access, beneficiary_grace_periods, beneficiary_display_overrides | E/U | RL | both directions |
| section_permissions | E | RL | |
| section_security, section_unlock_sessions | U | SEC/UP | PIN hashes, unlock sessions |
| binder_shares, binder_skipped_sections | U/E | UC/SEC | public tokens — revoke |
| share_quote_submissions, share_card_cache | U | UC | Voices public quote withdrawn |
| quickstart_progress, onboarding_progress | E/U | UP | |
| trustee_grants | U (benefactor_id) | RL/UP | revokes trustee logins |
| grace_periods | E/U | OP | |
| user_subscriptions | U | FIN/UP | cancel at Stripe first; Apple: user instruction; facts persist in payment_transactions (anonymised) |
| subscription_overrides, subscription_intents, tier_verifications (+ objects), lifecycle_events | U | UP/FIN | |
| referral_codes | U | UP | |
| notifications, notification_preferences, digest_preferences, user_preferences, push_subscriptions | U | UP | |
| webauthn_credentials, webauthn_challenges, otps, otp_codes, otp_trust, sms_otp_verifications, export_stepup | U | SEC/UP | credentials + ephemeral auth state |
| download_tokens, message_download_tokens, download_events | U | EPH/OP | |
| chunked_uploads (+ temp objects) | U | OP | |
| support_conversations, support_messages, support_threads, beta_tickets | U | UC | D5 |
| partner_client_notes | client_id | UC (3rd-party authored) | delete when the *client* is erased |
| ai_feedback, guardian_usage, funnel_events | U | UC/OP | |
| user_consent | U | UP | current state only — history retained in consent_audit_log |
| failed_logins | email | SEC/EPH | delete by email |

### 2b. ANONYMISE IN PLACE (aggregate value kept, identifiers removed) — 8 collections

| Collection | Fields unset | Why not delete |
|---|---|---|
| xai_usage | user_id, session_id | daily spend + model-substitution alerting needs history |
| llm_cost_ledger | user_id, estate_id | cost accounting; TTL 180 d anyway |
| ai_fallback_events | user_id, estate_id | fallback-rate alert |
| funnel_sessions | ip_address, demographics, referral_email, converted_user_id | conversion analytics |
| referral_attributions | erased party's user id | referral programme accounting (rewards paid) |
| b2b_codes | user_email, user_id | partner code usage counts |
| founders_circle | estate_id, estate_name | payment-plan accounting (FIN, 7 y) |
| purge_records | original_filename, user_id → hash | proof of destruction (24 m) |

Once identifiers are removed these rows are no longer personal data; no retention basis is needed.

### 2c. RETAIN (with legal basis and period)

| Collection | Class | Period | Basis |
|---|---|---|---|
| audit_trail (hash-chained, TTL 7 y exists) | SEC | 7 y | Art. 17(3)(e), 6(1)(f); CCPA 105(d)(2); SOC 2 CC7.2. Immutable by design — modifying entries breaks chain integrity; disclose in policy |
| security_audit_log, sensitive_access_log, phi_access_log, trustee_audit_events, admin_audit_log | SEC | 7 y (published) — D6 may shorten to 3 y | Art. 17(3)(e), 6(1)(f); CCPA 105(d)(2),(3); SOC 2 |
| security_incidents | SEC | 7 y | Art. 33(5) breach documentation; 17(3)(e) |
| consent_audit_log (user_id → sha256) | compliance | 3 y | Art. 7(1) prove consent; 17(3)(e); CCPA Regs §7101(a) |
| deletion_requests (email/name → sha256) + new erasure_receipts | compliance | 24 m | CCPA Regs §7101(a); Art. 5(2) accountability |
| payment_transactions, apple_transactions, apple_webhook_log (user_id → erasure_ref) | FIN | 7 y | Art. 17(3)(b) legal obligation (26 U.S.C. §6001); CCPA 105(d)(1),(8); chargeback defence 17(3)(e) |
| token_blacklist (TTL ≤ 9 h), token_revocations (needs TTL = max token life) | SEC/EPH | until token expiry | security — keeps revoked sessions dead; Art. 32 |
| escalations, shift_notes, team_messages (user references redacted) | STAFF/ops | 3 y | 6(1)(f) service quality, employment records |

### 2d. NO PERSONAL DATA / OUT OF SCOPE FOR USER ERASURE — 45 collections

PLAT: admin_settings, app_settings, platform_settings, platform_rules, platform_cache, dev_config,
feature_gates, subscription_settings, session_policies, emergency_access_policy, integration_health,
integration_overrides, alert_state, scheduler_locks, scheduler_heartbeats, migrations,
schema_migrations, audit_chain_state, audit_repair_queue, ai_burn_guard_usage, notification_categories,
notification_metrics (aggregate), queue_alerts, site_assets, partner_brief_content, idempotency_keys
(TTL), rate_limits (TTL), referral_visits (ip_hash, TTL 180 d), announcements, canned_responses,
knowledge_base, training_modules, voices_digest_sends, voices_social_brief_sends, founder_email_prefs.
STAFF (erased on staff off-boarding by admin, not by consumer erasure): shift_schedules,
shift_swap_requests, team_channels, team_channel_reads, training_completions, ip_whitelist.
B2B (admin-run erasure on request): partner_managers, b2b_partners, partner_client_notes (author side).
PROSPECT (no account — email-based erasure tool + 24 m retention): partner_brief_leads,
partner_brief_try_attempts, founder_access_requests, founder_invites (`used_by_ip` → drop after 90 d).
client_errors (IP + UA, no user id): not erasable per user → TTL 90 d.

### 2e. Outside MongoDB

- Object storage prefixes: `estates/{id}/`, `photos/estates/{id}/`, `photos/users/{uid}/`,
  `latest-pdfs/{uid}/`, chunked-upload temp, tier-verification uploads, death certificates,
  share-card images. `purge_estate_storage` / `purge_user_storage` cover the first four; the rest
  must be added and the manifest test must prove every `s3_key` in a deleted row was purged.
- Processors (Art. 28 / CCPA 105(c)): xAI (ZDR — nothing to delete, state it); Resend (email logs
  hold recipient address + subject — request deletion via API or accept provider retention and
  disclose); Sentry (events may carry user id/email — PII scrubbing on, 90 d retention, disclose);
  Stripe/Apple (financial records — retained under 17(3)(b)); Render/Vercel request logs (IP,
  provider retention — disclose); MongoDB Atlas backups (deleted data persists until snapshot
  rotation — disclose "removed from backups within N days").

## 3. Design

### 3.1 One manifest, one service
`services/erasure_manifest.py` — the inventory above as data: `{collection, key: user_id|estate_id|
email|owner_id|benefactor_id|beneficiary_id|..., action: delete|anonymise(fields)|retain(basis,
period), storage: [prefix rules]}`. It also generates `GET /compliance/retention-policy`, so the
published policy can never drift from what the code does.

`services/erasure.py`
- `erase_estate(estate_id, *, actor, reason)` — every E-scoped row + storage; used by benefactor
  estate-delete, admin estate-health delete, and inside `erase_user`.
- `erase_user(user_id, *, actor, reason, mode)` — preflight → provider cancellations → for each
  owned estate `erase_estate` → U-keyed deletes → anonymisations → RL both-directions → session
  revocation → receipt → audit_trail(compliance) → confirmation email (address held in-memory only).
- `erase_email(email)` — PROSPECT collections + failed_logins + Resend, for people with no account.
- Receipt (`erasure_receipts`): `{id, subject_hash: sha256(email_lower), user_id_hash, role,
  requested_at, executed_at, actor, per-collection counts, storage_objects, processors_notified,
  legal_hold: false}` — no PII; satisfies CCPA 24-month records and lets support answer "was this
  address erased?" without keeping the address.
- **Drift guard** (fast suite): a test walks every collection in the DB and every `db.X.insert` in
  code; any collection carrying `user_id/estate_id/email/owner_id/benefactor_id/beneficiary_id/
  actor_id` that is not in the manifest fails the pre-push gate. A scratch-DB end-to-end test seeds
  one row per manifest entry and asserts zero remain after `erase_user`, except the RETAIN set.
- Admin user-delete and benefactor estate-delete become thin wrappers over the service, so the
  founder's manual deletions get identical completeness.

### 3.2 Self-service account deletion (GDPR Art. 17 / CCPA §1798.105, Regs §7022)
1. Settings → Privacy → **Delete my account** (replaces the current request card).
2. **Step 1 — impact preview** (server-computed): estates, documents, beneficiaries who lose access,
   undelivered scheduled messages, active subscription (Stripe cancelled automatically / Apple:
   cancel in App Store), partner-managed status, trustee logins revoked. CTA: *Download my data first*
   (existing export, Art. 20).
3. **Step 2 — confirm**: re-authenticate (password + passkey/OTP step-up where enabled — reuse
   `export_stepup`), type the account email, tick acknowledgements (beneficiaries lose access;
   undelivered messages are destroyed; irreversible after the window). Two distinct steps satisfy
   CCPA Regs §7022.
4. **T0**: user → `pending_deletion`, `scheduled_for = T0 + 14 d`; all sessions revoked; login lands
   on a single "scheduled for deletion on <date> — Cancel" screen; owned estates read-only;
   scheduled deliveries paused; confirmation email with a signed cancel link.
5. **T+14 d**: `erasure_executor` (daily scheduler, supervised like the others) runs `erase_user`
   unless `legal_hold`; completion email; admin notification. Well inside Art. 12(3) one month and
   CCPA 45 days; the frozen window is "without undue delay" in practice (industry norm 14–30 d).
6. **Guards**: transitioned estates (benefactor deceased) are excluded from self-service — admin
   path with legal review, retention 7 y post-transition as published; `legal_hold` flag
   (admin-only) blocks execution with the reason recorded on the receipt.

### 3.3 Admin
Compliance → Deletion requests: statuses (pending → scheduled → executed | cancelled | held), SLA
countdown (GDPR 30 d / CCPA 45 d), Execute now, Legal hold, receipt viewer, **Erase by email** for
prospects, processors checklist. Existing `pending_deletions` counter points here.

### 3.4 Copy + policy
`/privacy` §7–8: the self-service path, the 14-day window, retained categories with bases,
processors, backup rotation window. `/security`: deletion finality bullet. In-app
`/compliance/retention-policy` generated from the manifest.

### 3.5 Retention hygiene shipped in the same phase (small, reuses manifest)
otps/sms_otp_verifications → hash the code, Date-typed `expires_at` + TTL; failed_logins TTL 1 h;
webauthn_challenges TTL 10 m; token_revocations TTL = max token life; client_errors TTL 90 d;
chunked_uploads abandoned-after-24 h sweep; funnel_sessions TTL 24 m; founder_invites drop
`used_by_ip` after 90 d; fix `activity_logs` → `activity_log`.

## 4. Founder decisions required before code
- **D1 Window**: 14-day frozen cooling-off (recommended) vs immediate execution vs 30 d.
- **D2 Beneficiary self-erasure**: (A, recommended) unlink the account, keep the benefactor's
  designation record (name/contact/relationship) as the benefactor's own data, status
  `account_deleted`, tell the beneficiary how to object (Art. 21 → privacy@) — vs (B) delete the
  designation too.
- **D3 Milestone messages already delivered**: delete sender-side rows and media (recommended;
  delivered emails cannot be recalled) vs retain delivered copies for recipients.
- **D4 Beneficiaries at T0**: estates read-only immediately (recommended) vs access until T+14.
- **D5 Support transcripts**: delete (recommended) vs anonymise for QA.
- **D6 Log retention**: keep published 7 y for user-level security/access logs vs shorten to 3 y
  (audit_trail stays 7 y).
- **D7 Partner-managed clients**: notify the partner manager on client erasure — yes/no.
- **D8 Apple IAP**: erasure proceeds even with an active Apple subscription (user told to cancel) —
  yes/no.

## 5. Build phases (each independently testable)
1. Manifest + `erase_estate`/`erase_user`/`erase_email` + receipts + drift guard + scratch-DB test;
   admin/estate deletes rewired; `activity_logs` fix; retention-hygiene TTLs. (Backend only.)
2. Self-service flow (impact preview, step-up, two-step confirm, pending state, cancel link,
   emails), `erasure_executor` scheduler, login-gate screen. (Full stack.)
3. Admin compliance page, Erase-by-email, processors checklist, `/privacy` + `/security` copy,
   generated retention policy, full testing-agent regression.

## 6. Dependency pass (scheduled separately — before Phase 2)
Tier 1 (untrusted-input path, do first): pypdf 6.11.0 → 6.16.1 (18 advisories: crafted-PDF infinite
loops / memory exhaustion), pillow 12.2.0 → 12.3.0 (20 advisories: malformed font/image parsing),
python-multipart 0.0.27 → 0.0.31 (form/Content-Length parsing), starlette 1.0.1 → 1.3.1 (request
path validation, request.form()) with fastapi compat check. Tier 2: aiohttp → 3.14.3, cryptography
46 → 50 (major, test passkeys + encryption), pyasn1, httplib2, click, msgpack. Tier 3: litellm 1.80 →
1.84 is transitive via emergentintegrations (used only for Stripe checkout) — bump if compatible,
else founder decision to move checkout to the stripe SDK. Gate: upload/PDF/image test files +
fast suite + testing-agent regression; re-baseline `.dep_security_baseline.json` only after.
