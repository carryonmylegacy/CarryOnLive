# Public Pages — "Advertised vs. Delivered" Audit (Sep 16, 2026)

Scope: `/`, `/home`, `/login`, `/start`, `/get-started`, `/signup`, `/pricing`, `/about`, `/founder-about`, `/customers`,
`/changelog`, `/privacy`, `/terms` + TrustBadges, FAQ, JSON-LD, in-app `SubscriptionPaywall` (legacy copy).
Method: every concrete promise extracted from the copy → traced to backend route / frontend flow in THIS repo.
Status legend: ✅ delivered · ⚠️ partially / imprecise · ❌ not delivered · 🏢 business claim (not code) · 🔀 depends on live backend (see §0)

---

## 0. STATUS (Sep 16, 2026 — RESOLVED on branch `reconcile`, not yet pushed)

Reconciliation done per `RECONCILIATION_PLAN.md` Option A. Every ❌/⚠️ marked **FIXED** below shipped in this session; items marked **OPEN** are still outstanding. Preview DB now mirrors live (`backend/scripts/mirror_live_config.py`).

Fixed: plain-English security copy everywhere (§1b rows 1–3, 6, 7 reworded honestly); "continuity escrow" → Wind-Down Promise link; 24/7 / nationwide / iOS-Android removed; About CTA → `/start`; `/pricing` table reads portal gates (no "Up to 3/5", no vault tiers, no priority-support row); "Family plan savings" copy; StartPage "Unlimited storage"; paywall 24-48h → 24h; paywall Family tile already dynamic in Job L; GetStarted trial days already dynamic in Job L; Privacy already names xAI, uses carryon.us contacts, no voice biometrics (Job L).

Still OPEN (backend/product work, founder to prioritise): §1a Priority support by tier; §1a referral +7 convert/invite flow; §1a hospice deep-link preselect; §1b user-facing "Access history" card; §1b full ZIP export button (Job L has per-document downloads + JSON export — verify against Wind-Down Promise wording); §1b Terms additions (auto-renew, post-transition pricing, retention); §1c CCP example list ("job loss") vs PLAN_TYPES; Privacy disclosures for Meta Pixel / Firebase / Google Places / Resend / S3 / 90-day retention.

## 0-old. P0 BLOCKER — two divergent backends (found during the audit)

| Environment | Backend build (`/api/health`) | Evidence |
|---|---|---|
| **Production** `carryon-api-kacr.onrender.com` | `2026-04-28T00:00:00Z-pre-launch-refactor`, 15 schedulers | Live `/api/subscriptions/plans` has a **Seniors** plan ($12.99, `age_min/age_max/age_out_plan_id`), a **free_mode** tier, feature gates **CFP, BEC (Beneficiary Estate Concierge AI), CES (Entities & Structures), TMA (Trustee Mode Access)**, `launch_price/final_price`, `quarterly_discount_percent/annual_discount_percent`, `allows_billing_toggle`. `trial_duration_days` is absent. `beta_mode=false`, family discounts 30% (benefactor) / 50% (beneficiary). Gates: EGA off for base/new_adult; DAV off for standard/base/…; **ECT+CCP off for everything except premium**. |
| **This repo / preview** `chat-smooth.preview.emergentagent.com` | `2026-03-10T17:05:00Z-fix-welcome-redirect` (BUILD_HASH never bumped) | `git log -S` over 4,686 commits: **"seniors" plan, "free_mode", "Estate Concierge", "Trustee Mode Access", "Entities & Structures" never existed here.** `launch_price` existed only in Feb-2026 `server_original_backup.py` (deleted). This repo has quiz / testimonials / platform-stats / founder profile / trial-days — all **404 on production**. |
| **Production frontend** `www.carryon.us` (`main.5280aea1.js`) | built from THIS lineage on Sep 16 (has "readiness quiz", "continuity escrow", **not** D4 "Nobody you invite pays") | index.html loads `assets.emergent.sh/scripts/emergent-main.js` → deployed via Emergent, calling the Render API. |

Consequences:
- Backend fixes made here do NOT reach carryon.us until the two backends are reconciled.
- **Deploying this repo's backend to Render would remove the Seniors tier, free_mode, CFP/BEC/CES/TMA gates, launch pricing from the live product.** Do NOT trigger a Render deploy or "Save to GitHub" onto the Render branch until reconciled.
- User's Founder Portal settings are NOT broken — preview DB simply held different values.
- USER DECISION (Sep 16 night): option **b** — reconcile first, then make every feature live in both environments and keep preview DB mirroring live config. Awaiting: Render service repo/branch/commit, GitHub branch list, ZIP of deployed branch, Emergent deployment info.

Frontend `PricingPage.SPECIAL_ORDER` already lists `'seniors'` (a previous agent saw it in the live API) — keep seniors wording only if the live backend remains source of truth.

---

## 1. Claims matrix

### 1a. Pricing & billing (`/pricing`, `/start`, FAQ)
| Claim | Where | Status | Evidence / action |
|---|---|---|---|
| Prices live from Founder Portal, monthly/quarterly(-10%)/annual(-20%) | pricing, start | ✅ | `GET /api/subscriptions/plans`; `plans.py` self-heals q/a prices |
| "Explore first, N days, no card" | everywhere | ✅ | `auth.py:568` sets `trial_ends_at`, `subscription_status=trialing`; no card at signup |
| "You'll be asked to subscribe when the exploration period ends" (hard paywall) | start | ✅ (code) / config | `App.js:193-204` + `SubscriptionPaywall.js:315` (skip only while trial active). Suppressed when `beta_mode` true — live is OFF ✔ |
| "Cancel anytime … from your account" | badges, trust, pricing | ✅ | `POST /subscriptions/cancel`; UI `SubscriptionManagement.js:430` |
| "Payments secured by Stripe" | badges | ✅ | Stripe Checkout, `checkout.py` |
| "People you invite pay nothing while you're alive; $ben_price/mo after, 30-day grace" | pricing, start | ✅ | `checkout.py ~711`, `GRACE_PERIOD_DAYS=30`, `beneficiary_grace_periods` |
| Comparison table rows: Base "Basic vault / no MM / no EGA / Up to 3", Standard "Expanded / Up to 5", Premium "Unlimited" | `PricingPage.js:320-330` (hardcoded) | ❌🔀 | THIS repo enforces **no** invite limit (`beneficiaries.py`), **no** storage tiers (only 25 MB/file, `documents.py:263`); preview gates give Base MM+EGA. Live gates DO turn EGA off for Base. **Fix: drive the table from `tier_features` (live gates) instead of hardcoding; drop or enforce "Up to 3/5" + vault tiers** (no portal setting for either exists in this repo). |
| "Emergency plans (CCP)" / "Private family messaging (ECT)" ✓ for Standard & Premium | table, 8 tools | ❌🔀 | Live gates: ECT/CCP **off for Standard** (on for Premium only). Same fix as above; homepage tools should read gates and mark "Coming soon" when off for every tier |
| "Seniors … pay less" / SPECIAL_ORDER 'seniors' | `PricingPage.js:15,382` | 🔀 | Plan exists in live API only. Keep only if live backend stays source of truth |
| "verified once, usually within 24 hours" (pricing) vs FAQ "typically within 24 hours" vs paywall "24-48 hours" | pricing:288, FAQ, `SubscriptionPaywall.js:304` | ⚠️ | User: **24 hours is OK** → align paywall copy to 24 hours |
| "Priority human support (CST)" (Premium) / "Priority support" (Military, Veteran) | plan features | ❌ | `support.py` has no tier priority — only P1 emergency. **Fix: tag conversations with `priority: 'tier'` for premium/military/veteran, sort/badge in ops queue** |
| "Family plan savings — a discount on every tier" | homepage `PLATFORM_FEATURES` | ⚠️🔀 | Discount % is portal-set (live 30%/50%, preview 0). **Fix: card copy should not assert a discount; pricing/start already conditional** |
| Family Plan tile "$3.49/mo flat", "$1/mo discount", "Floor tiers exempt" | `SubscriptionPaywall.js:632-688` | ❌ | Hardcoded legacy; live model is % discounts. **Fix: render from `family_*_discount_percent`** |
| "Unlimited secure document storage" (Door 1, all paid plans) | `StartPage.js:206` | ⚠️ | Contradicts "Basic/Expanded" table rows; no quota exists → say "Secure document vault" |
| "+7 bonus days on your trial — for both of you" (referral) | `GetStartedPage.js:707` | ❌ | `POST /funnel/convert` (grants +7) is **never called** by the frontend; no invite email is sent to the typed address; invitee never gets +7. **Fix: SignupPage reads `location.state.funnel_session_id` → call convert after signup; send Resend invite with `/start?ref=…`; `auth.signup` grants +7 when `ref` matches** |
| Hospice link "Enrolled in certified hospice care? Full access at no cost" → `/get-started?plan=hospice` | pricing:414, start:382 | ❌ | `GetStartedPage` ignores `plan`; `SignupPage` ignores `location.state`/query → user lands on generic funnel. **Fix: pass through and preselect Hospice eligibility + banner** |
| "Free for every American in hospice care … no timer" | homepage, FAQ | ✅ | `hospice` plan price 0, `requires_verification`, `/verification/upload` |
| "Military/Veteran: DD214, VA letter, military ID" | FAQ | ✅ | `verification_docs` in `plans.py` |
| "New Adult 18–25, auto-detected" | pricing note | ✅ | `auth.py:573-578` |
| Quarterly/annual "Save 10% / 20%" | toggles | ✅ | plans.py |
| "Base… Beneficiary management (up to 3)" (plan feature string) | plans.py:183 | ❌ | Not enforced (see above) |

### 1b. Security & privacy claims (hero badges, security grid, trust block, About, Privacy, Signup, Settings footer)
| Claim | Where | Status | Evidence / action |
|---|---|---|---|
| "AES-256 encrypted", "separate key for every family" | hero badges, security, pillar 02 | ✅ | `services/encryption.py` AES-256-GCM, key = PBKDF2(master, estate_salt) |
| "Your own encryption key" (badge) | `heroCopy.js` | ⚠️ | Key is derived **server-side**; user never holds it → reword "A separate key for every family" |
| "Nobody at CarryOn can read your documents — not support, not engineers, not the founder" / "Zero-knowledge" / "Zero-Knowledge Architecture" | trust item, pillar 02, Privacy §5, Signup badges:434, Settings footer:203, Paywall:725, About:215 | ❌ | Server holds key material → staff with prod env + DB **can** decrypt. **Rewrite in plain language (user: "so my 80-year-old mom understands"):** locked with a code only your family's vault uses; our support screens can't open your files; every time a file is opened it's written down with who and when. Remove "zero-knowledge" everywhere |
| "AI review … without anyone else reading your documents", "works entirely inside your encrypted vault", "nothing leaves it", **"Air-gapped AI"** | pillar 03, security item 2, About values | ❌ | `guardian.py:135-147` decrypts document text and sends it to **xAI (Grok) API** via `xai_client`. **Rewrite + disclose AI processor in Privacy Policy** |
| "Two-step sign-in on every login, trusted-device options" | security, badges | ⚠️ | OTP default-on but user-disableable (`otp_enabled`), platform `otp_disabled`, passkeys → "Two-step sign-in, on by default" |
| "Real people confirm a death or incapacity before anything unlocks" | security, FAQ | ✅ | `transition.py` TVT review, `emergency_access.py` admin review |
| "Sensitive records are permanently destroyed after your family's tasks are complete" | security | ⚠️ | Real policy: 90-day grace after sub ends → purge (`services/grace_period.py`); milestone messages never purged; transitioned estates pause until staff confirm → reword to the real schedule |
| "A full audit trail of who saw what and when" | security | ⚠️ | Backend logs `document_download/preview`, `digital_wallet_view`, `beneficiary_list_view` (`sensitive_access_log`) + `audit_log`; **no user-facing view** (`GET /compliance/sensitive-access-log` exists, unused). **Fix: "Access history" card in Security Settings** |
| "built on a SOC 2 compliance architecture with GDPR data rights" | security, Privacy meta | ⚠️ | Not audited/certified → "designed around SOC 2 controls"; GDPR rights ✅ (`compliance.py` export/delete/consent) |
| "Export everything, anytime" / "export everything at any time" | badges ×4 pages, trust item, FAQ ×2, Terms §10 | ❌ | Only `GET /compliance/data-export` (JSON **metadata**, excludes files/passwords/message bodies) via `PrivacyCard`; `/estate/{id}/export-pdf` exists but **no UI calls it**. **Fix: ZIP export (JSON + decrypted document files via `_get_decrypted_blob` + message media + DAV entries + PDF summary) with a Settings button** |
| "Bank-grade security · 256-bit SSL" | Login/Signup footers | ✅ | TLS via host; acceptable |
| Privacy: "Voice biometric data (voiceprints)"; Terms §2 "voice biometric verification" | Privacy §2/§5, Terms §2 | ❌ | `services/voice_biometrics.py` exists but **no frontend uses it** → remove from legal pages |
| Privacy: contact `support@carryon.com` | Privacy §10, Terms §12 | ❌ | Wrong domain → `info@carryon.us` (site-content footer) |
| Privacy missing disclosures | Privacy | ❌ | AI processor (xAI), Meta Pixel (`REACT_APP_META_PIXEL_ID`), Firebase analytics, Google Places, Resend, S3 storage, 90-day retention schedule, beneficiary access after transition. **Add sections** |
| Terms missing | Terms | ⚠️ | Exploration period + auto-renew (paywall says "renew unless canceled 24h before"), post-transition beneficiary pricing, retention/purge, AI disclaimer (partial) |

### 1c. Product/feature claims (homepage 8 tools, platform features, steps)
| Claim | Status | Evidence |
|---|---|---|
| Milestone Messages written/audio/video, unlimited | ✅ | `messages.py` (video/audio blobs encrypted) |
| Vault: wills/trusts/policies/deeds, share per person | ✅ | `documents.py`, `section_permissions.py` |
| Guardian AI tuned to your state, finds gaps, extracts contacts/deadlines | ✅ | `guardian.py:207` uses `address_state`; IAC generation |
| Immediate Action Checklist "started from your documents" | ✅ | `iac_ai_generated` |
| Contingency Protocols "medical emergency, natural disaster, **job loss**, passing of a family member" | ⚠️ | `PLAN_TYPES = natural_disaster, national_emergency, medical_emergency, infrastructure_failure, custom` → align examples (custom covers the rest) |
| Estate Communications (encrypted, access-controlled) | ✅🔀 | `estate_chat.py`; gated by portal |
| Digital Access Vault "logins, subscriptions, crypto keys" | ✅ | categories incl. crypto |
| FFN list | ✅ | `ffn.py` |
| "Rank who steps in… promoted automatically" | ✅ | `succession_order`, reorder on delete (`beneficiaries.py:313`) |
| "Manage a parent's affairs alongside your own" | ✅ | multi-estate, family plan |
| "Emergency access… verified" | ✅ | `emergency_access.py` |
| "iOS and Android with face or fingerprint login and push alerts" | ❌🏢 | **User: no apps published yet.** Web push (VAPID) + PWA install ✅, `@capgo/capacitor-native-biometric` only in native build → reword: "Works on any phone — add it to your home screen, get push alerts. App Store / Google Play apps coming." |
| "Estate Readiness Score" | ✅ | `services/readiness.py` |
| "Financial Portal & Bill Tracker", "Push notification reminders" | ✅ | `financial_portal.py`, `push.py` |

### 1d. Business / trust claims (About, FAQ, trust block)
| Claim | Status | User ruling (Sep 16) |
|---|---|---|
| "continuity escrow so access continues even if the company doesn't" (FAQ ×2) | 🏢❓ | Not confirmed → soften to export + 90-day download window unless user confirms a real escrow |
| "24/7 platform support" (About CST card) | 🏢❓ | Not confirmed → "In-app human support" |
| "nationwide network of remote professionals… Three teams. One mission." (About) | 🏢❌ | **User: not true yet** → remove |
| "iOS and Android" apps | 🏢❌ | **User: no apps yet** |
| Verification "within 24 hours" | 🏢✅ | **User: OK** |
| "76% of American families…" | 🏢✅ | **User: accurate** |
| "Built in Arlington, Virginia since 2024 … registered U.S. company, real address & phone" | ✅ | site-content footer |
| "No invented testimonials / numbers" | ✅ | testimonials pipeline, LiveStats gated ≥25 |
| About CTA "Get Started" → `/signup` | ⚠️ | Funnel is `/start` → fix link |
| GetStarted "30 days" hardcoded | ⚠️ | read `trial_duration_days` |

---

## 2. Fix plan (blocked on §0 for backend items)

**Frontend/copy (safe regardless of backend):**
1. Plain-language security rewrite everywhere (hero badge, pillar 02/03, security grid, trust item, About values, Signup badges, Settings/Paywall footers) + Privacy AI/pixel disclosures + Terms additions; remove voice biometrics; fix contact email.
2. `/pricing` comparison table + homepage 8 tools read `tier_features` from `/api/subscriptions/plans` (portal wins); drop unenforced "Up to 3/5" & vault-tier rows unless enforcement is added.
3. Remove "nationwide network / three teams", "iOS and Android apps", "24/7"; keep 24h verification + 76%; About CTA → `/start`; CCP examples aligned; "Family plan savings" copy; StartPage "Unlimited storage"; GetStarted dynamic trial days; SubscriptionPaywall Family tile dynamic; paywall "24-48 hours" → 24 hours.
4. Hospice deep-link pass-through to Signup eligibility.

**Backend (this repo; must be merged into the production branch):**
5. `GET /api/compliance/export-archive` ZIP + Settings button ("Download everything").
6. Referral: convert call + invite email + `ref` bonus.
7. Security Settings "Access history" (uses existing endpoint; add accessor names).
8. Tier-based support priority.
9. Optional: portal-configurable per-plan `max_invited_people` + enforcement if user wants the "Up to 3/5" rows kept.

## 3. Verified-OK list (no action)
Stripe checkout & webhooks, cancel, 30-day trial + hard paywall, beneficiary grace pricing, verification uploads, hospice free plan, military/veteran docs, new-adult auto-detect, succession promotion, section permissions, emergency access review, TVT transition review, Guardian state-awareness, IAC generation, video/audio milestone messages, FFN, DAV categories, readiness score, financial portal, push, quiz (+email), testimonials moderation, live stats gating, changelog, founder card/JSON-LD, real screenshots, UTM capture, GDPR consent/export(JSON)/deletion request, 90-day grace scheduler.
