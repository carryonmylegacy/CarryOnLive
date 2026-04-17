# CarryOn - Family Preparedness Platform PRD

> ## 🔴 AGENT PROTOCOL — READ FIRST, EVERY FORK
>
> **Before doing ANYTHING, read `/app/memory/AGENT_RULES.md`.**
> It contains persistent rules the user has established across sessions that
> MUST survive agent forks. The most important ones:
>
> 1. **Every summary to the user MUST include a full housekeeping + ruff report**
>    run via `bash /app/scripts/check.sh`. No exceptions.
> 2. **Housekeeping WARNs must be FIXED, not reported.** Fix every WARN/FAIL
>    before calling `finish`, regardless of whether it predates the session.
>    Do not rationalize. The user's words (Apr 17, 2026): "These things are
>    easy to fix. I want them always fixed! I didn't have you build the
>    housekeeping script for you to simply identify things, it is meant for
>    you to identify AND FIX things before I push."

---

## Original Problem Statement
Comprehensive family preparedness platform with estate planning, secure document vault, milestone messages, estate chat, connected care protocol, financial portal, and subscription management.

## Current Architecture
- **Frontend**: React 19 (components, pages, contexts) + Capacitor (iOS/Android)
- **Backend**: FastAPI (routes, services, models) + Motor/MongoDB async driver
- **Database**: MongoDB (Atlas in prod)
- **Payments**: Stripe + Apple IAP (pending Apple agreement)
- **AI**: xAI Grok via Emergent LLM Key
- **Email**: Resend
- **Storage**: S3 (prod) + LocalStorage fallback (dev)
- **Monitoring**: Sentry (env-gated — activates when `SENTRY_DSN` / `REACT_APP_SENTRY_DSN` set)

## What's Been Implemented

### Core Features (Complete)
- PWA with push notifications
- Estate Chat (ECT) with iMessage-like UI, emoji reactions (700+), voice messages, image sharing
- Connected Care Protocol (CCP) with Tap-to-Create Wizard
- Milestone Messages
- Secure Document Vault (SDV)
- Financial Portal
- Family Plan with discount stacking
- Multi-tier subscription system (Premium, Standard, Base, New Adult, Military/1R, Hospice, Veteran, Enterprise)
- Admin portal with founder, operations, finance, compliance, marketing, platform scopes
- /speak-with-us marketing page with LeadConnector calendar
- Founders Circle Lifetime Subscriptions (4 phases complete)

### Launch-Readiness Work (Apr 16, 2026 — this session)

**🔴 Stream A — Infrastructure Hardening**
- MongoDB-backed distributed scheduler lock (`services/scheduler_lock.py`) wraps all 10 background schedulers so they run on exactly one pod in multi-instance deployments. Degrades open if Mongo unreachable.
- MongoDB-backed sliding-window rate limiter (`services/rate_limiter.py`) replaces in-memory `defaultdict` — now survives multi-pod with no Redis dependency.
- VAPID `/tmp/` fallback removed — requires inline `VAPID_PRIVATE_KEY` env for production persistence.
- `/api/health/live` + `/api/health/ready` endpoints added (K8s/Railway liveness & readiness probes).
- Graceful shutdown bounded to 10s with `asyncio.wait_for` (prevents hung SIGTERM).
- Sentry SDK wired on backend (FastAPI + Starlette integrations) — zero-cost when DSN unset.
- Sentry browser SDK wired on frontend — dynamic import, zero bundle cost when DSN unset.
- `/app/load_tests/signup_and_dashboard.js` — k6 script for 100-VU signup + dashboard stress test + README.

**🛠 Stream D — Admin UX**
- `AdminCommandPalette` component: ⌘K/Ctrl+K global shortcut opens fuzzy search over all admin tabs, user directory, and quick actions. Trigger pill added to admin header.

**📐 Stream C — Visual Hierarchy / Stability Fixes**
- Post-login-after-update jitter FIXED (`utils/versionCheck.js` rewritten): no more mid-session `window.location.reload()`. Reloads now scheduled for next safe navigation, with explicit blocklist for /login, /signup, /accept-invitation, /create-estate, /onboarding, /founders-circle, /subscription. Never reloads during form typing or when a modal is open.
- `PageLoader` now has a 180ms appearance delay — eliminates the sub-100ms spinner flash on cached route hits.

**🎨 Stream B — Varsity Visual Polish**
- Motion tokens defined: `--motion-micro`, `--motion-standard`, `--motion-page`, `--motion-celebrate`.
- `glass-card` transitions now use motion tokens (border, shadow, transform separately — not `all`).
- `.nav-item` transitions moved from `all 0.25s` to targeted properties using motion tokens.
- HomePage: bouncy gold "Scroll to explore" gradient button → quiet "DISCOVER MORE" chevron.
- LoginPage: same treatment applied to both desktop + mobile "Scroll to explore" instances.
- SettingsPage reorganized with section headers (Profile / Security / Appearance & Navigation / Notifications / Privacy & Data / Beta Testing) + gold rail hero accent. Zero functional changes; every existing card and switch remains.

**🔎 Audit Documents**
- `/app/memory/ESTATE_CREATION_PATHS.md` — traces all 7 estate-creation paths, flags: default checklist seed missing on Path 1/2, race condition on concurrent Path 2 posts (suggested partial unique index fix), and drift between 3 ghost-estate detectors.
- `/app/memory/PAYMENT_FLOW_AUDIT.md` — traces Stripe + Founders Circle + Apple IAP + grace-period flows. Flags: **missing `free_access` override for NEW beneficiaries added AFTER FC activation** (15-min fix), Stripe webhook reconciliation gap (safety-net scheduler suggested), unverified FC installment-failure → revert-to-monthly logic (test recommended), pre-launch Stripe webhook secret verification (curl test provided).

## Blocked Items (3rd party)
- Apple IAP: awaiting Apple "Paid Applications Agreement"
- Twilio SMS: awaiting A2P 10DLC campaign approval

## Launch-Week Follow-up (Apr 16, 2026 — same day, second pass)

**🔴 Founders Circle free_access gap CLOSED** (was flagged in PAYMENT_FLOW_AUDIT.md)
- New helper `_grant_fc_free_access_if_applicable(estate_id, user_id)` in `routes/beneficiaries.py`
- Called from all 3 invitation-accept paths: new-user signup, existing-user-by-email, existing-user-by-username/password
- Idempotent (`upsert`) + try/except so failures never block invitation acceptance
- Late-joining beneficiaries on FC-funded estates now correctly receive `subscription_overrides.free_access: true`
- Verified by testing_agent: 100% pass (18/18 backend tests)

**🛰 Launch War Room — real-time platform health dashboard**
- Backend: `GET /api/admin/launch-war-room` returns traffic (signups 5m/1h/24h, active users 15m), performance (p50/p95/p99 latency, error rate, slowest endpoints, uptime), revenue (checkouts 1h, paid 1h, revenue 24h, FC 24h), infrastructure (DB status, distributed scheduler locks held)
- Derived alerts: p95 > 1500ms/3000ms (warn/critical), 5xx rate > 1%/5% (warn/critical), DB unreachable (critical)
- Frontend: `LaunchWarRoomTab` at /admin/war-room polls every 15s with LIVE/PAUSED toggle + Refresh. Admin tab placed under Platform section (scopes: founder, platform_health). New Radio icon in admin header.
- All metric cards use motion-token transitions and semantic color (gold/teal/blue/green/red by value)

## iOS Chat Keyboard — CRITICAL DO NOT TOUCH
See detailed V11 documentation in prior version. Key points:
- position:fixed inset:0 overflow:hidden — ZERO JS viewport manipulation
- Input bar container MUST have: background: var(--bg), borderTop: 1px solid var(--bg), paddingBottom: 4px
- overflow: hidden on textarea parent div clips iOS cursor rendering
- previewGuardRef (300ms) blocks phantom touches after image preview close
- Keyboard auto-dismisses via document.activeElement.blur() when long-press menu opens

## Varsity Typography Overhaul (Apr 17, 2026)
- Swapped `Outfit` (headers) + `DM Sans` (body) → single workhorse **Inter** for UI.
- **Cormorant Garamond** retained for brand/trust headers only (`var(--serif)`).
- CSS variables now: `--sans: Inter`, `--body: Inter`, `--serif: Cormorant Garamond`.
- Bulk replaced 210 inline `fontFamily: 'Outfit, sans-serif'` references across 79 files with `fontFamily: 'var(--sans)'` so theme changes propagate from one CSS source of truth.
- Updated `/public/index.html` font preload/link to `Inter + Cormorant Garamond` combined request.

## Admin UX Prototypes Tab (Apr 17, 2026)
- New founder-only admin tab at `/admin/prototypes` (`PrototypesTab.js`) catalogs isolated HTML wireframes in `/public/mockups/`:
  - `dashboard-v2.html` (Varsity-grade home tile redesign)
  - `onboarding-v2.html` (10-frame first-run signup flow)
  - `mobile-key-screens.html` (iPhone 13 mini → 17 Pro Max surfaces)
- Each card offers **inline iframe preview** + **Open in new tab** button with data-testids.
- Appears in Admin → Prototypes (founder scope only). Zero production footprint — mockups stay isolated HTML until explicitly promoted.

## Varsity Serif Treatment — Pillars, Heroes & Post-Login (Apr 17, 2026)
- Applied Cormorant Garamond (`var(--serif)`) to trust-carrying headers:
  - HomePage hero: "Every American Family. *Ready.*" (italic gold on "Ready")
  - LoginPage hero (both desktop + mobile variants)
  - LandingContent section h2s: "More Than Estate Planning.", "Valuable Right Now.", "Nine Pillars of Family Readiness.", "Built for Real Families.", "Family Readiness in Five Steps.", "Your Family's Privacy Is Non-Negotiable.", "Free for Every American in Hospice Care.", "Readiness Starts Today."
  - Each pillar title (9 titles) + "Comprehensive Family Preparedness." end-state + italic "They're ready. Because you prepared." sign-off
  - **Post-login carry-over (second pass)**: Dashboard greeting "Welcome back, *{name}*" (italic gold name) + Founders Circle hero + fallback hero
- Body text, buttons, UI controls remain Inter for clarity.
- Weight downgraded from bold → semibold/medium for the "editorial confidence" look.

## Housekeeping WARN Cleanup (Apr 17, 2026)
Per user mandate, housekeeping WARNs are now fix-before-finish:
- **Mongo projection safety (A1.2)**: Added `"id": 1` to `founders_circle` projection in `routes/beneficiaries.py:_grant_fc_free_access_if_applicable`.
- **Min font size / iOS accessibility**: Bumped 4 instances of `text-[10px]` → `text-[11px]` across `PrototypesTab.js`, `LaunchWarRoomTab.js` (2 places), and `AdminCommandPalette.js`.
- Result: `bash /app/housekeeping.sh` now reports **66 PASS, 0 WARN, 0 FAIL**. `scripts/check.sh` says **ALL CLEAR — SAFE TO PUSH**.

## Founders Circle Celebration Screen (Apr 17, 2026)
- New component `FoundersCircleCelebration.js` — fullscreen confirmation shown after a successful FC purchase (`SubscriptionPage.js` hook on `fc_session_id` query param).
- Replaces the bare `toast.success('Founders Circle activated! ...')` with a proper "moment": gold crown seal, pulsing ring, sparkle decorations, serif hero *"Welcome to the Founders Circle, **{firstName}**."*, tier + estate callout, 3-perk bullet list, dual CTA (Share the news + Continue), italic serif sign-off *"Thank you for carrying us forward."*
- Share button uses `navigator.share` (Web Share API) with clipboard fallback — works on iOS/Android PWA and desktop.
- Escape key + close button dismiss the overlay. Body scroll locked while open.
- All data-testids wired: `fc-celebration`, `fc-celebration-title`, `fc-celebration-share`, `fc-celebration-continue`, `fc-celebration-close`.
- Backend already returns `tier_name` + `estate_name` on the `founders_circle` record — no API change needed.

## Personalized Share Cards + Social Share Sheet (Apr 17, 2026)
- **Backend**: `routes/share_cards.py` — Pillow-based 1080×1080 PNG generator. Two variants:
  - `POST /api/share-cards/founders-circle` (auth) — opulent gold-on-navy, serif "Welcome to the Founders Circle, *— {name}*", crown seal, "FOUNDING MEMBER" chip.
  - `POST /api/share-cards/subscriber` (auth) — calmer teal accent, sans headline "My family is now prepared with CarryOn.", "I'M READY" chip, serif italic name accent.
  - `GET /api/share-cards/image/{id}` (public) — serves the cached PNG, 7-day TTL with auto-cleanup; path-traversal-safe (24-char hex id only).
  - Cormorant Garamond fonts (Bold/SemiBold/Italic) bundled at `backend/assets/fonts/`. Sans falls back to Liberation Sans (preinstalled).
- **Frontend**:
  - `components/SocialShareSheet.js` — reusable bottom-sheet modal. Image preview + 3 primary actions (Native Web Share, Copy image, Download) + 4×2 platform grid (X/Twitter, Facebook, LinkedIn, WhatsApp, Telegram, Reddit, iMessage/SMS, Email) + Copy caption text. Each platform opens a prefilled deep link in a new tab. Web Share API attaches the image when supported.
  - `components/FoundersCircleCelebration.js` — pre-fetches FC sharecard on mount; "Share the news" opens the share sheet (gold accent).
  - `components/SubscriberCelebration.js` — new less-opulent celebration shown after regular Stripe success. Emerald accent, sans headline, single italic serif accent line, "Tell your people" CTA opens the share sheet (teal accent).
  - `pages/SubscriptionPage.js` — both celebrations now triggered from the existing checkout-status handlers (replaces toast). FC: `fc_session_id` query param. Standard: `session_id` query param.
- All wired with full data-testids: `social-share-sheet`, `share-sheet-{x|facebook|linkedin|whatsapp|telegram|reddit|sms|email}`, `share-sheet-{native|copy-image|download|copy-text|close}`, `sub-celebration*`, `fc-celebration*`.
- Verified end-to-end: backend endpoints respond 200 with PNG (108KB FC, 112KB sub); frontend share sheet renders all 8 platform tiles + image preview correctly.

## Quote Composer + Randomizer (Apr 17, 2026)
Extension of the sharecard system — adds opt-in personalization + a fallback quote library so every card feels hand-written.

**Backend (`routes/share_cards.py`)**
- `CardRequest` now accepts optional `quote` (110-char max). `CardResponse` now returns the rendered `quote` + `quote_source` (`"user"` | `"random"`).
- Two curated pools (`_FC_QUOTES`, `_SUB_QUOTES`) of 12 brand-voice quotes each — different tones (legacy/aspirational for FC, practical/ready for subscriber).
- Deterministic-per-day-per-user randomizer: `_pick_quote(variant, name)` seeds on `variant|name|date` so a given user sees the same fallback across the day (cache-stable).
- Layout reflowed to fit a centered italic-serif quote box (wrapped to 2 lines, auto-ellipsized if > 110 chars). Smart curly quotes applied.
- `_normalize_quote()` trims, collapses whitespace, strips ™ (Cormorant glyph-missing), hard-caps length.

**Frontend**
- `SocialShareSheet.js` — gained `editableQuote`, `quote`, `quoteSource`, `onQuoteChange`, `onRandomize`, `regenerating` props. When enabled, shows an input field **"YOUR QUOTE ON THE CARD (optional)"** with a **"Surprise me"** randomizer button right below the image preview. Input commits on blur/Enter; parent re-fetches the card, preview dims + spinner appears while regenerating.
- `FoundersCircleCelebration.js` + `SubscriberCelebration.js` — now own the `quote` state + a shared `fetchCard(quoteValue)` callback that re-POSTs the card endpoint and updates state. Passes everything to `SocialShareSheet`.
- Caption text sent to share platforms now leads with the quote in smart quotes: `"{quote}"\n\nI just joined the Founders Circle — ...`.
- Hint copy: *"Leave blank and we'll use an inspiring quote — yours can still replace it anytime."*

**Verified**
- Backend: user-quote + blank (random fallback) paths both return 200 with correct `quote_source`.
- Visual: sharecard renders the italic serif quote with smart curly quotes; share sheet shows quote editor with live preview; Surprise-me cycles through pool deterministically per day.

## Voices — Permanent Share Entry + Consent + Testimonial Feed (Apr 17, 2026)
Closes two gaps: users could only reach the share sheet during the 30-sec post-purchase celebration, and their submitted quotes weren't being captured as real feedback.

**A. Permanent "Share your CarryOn" entry point**
- New reusable component: `components/ShareYourCarryOn.js` (`variant` = `"button"` | `"tile"`). Auto-detects if the user is a Founders Circle member and picks the FC or subscriber sharecard accordingly.
- Placed on the **Dashboard** (bottom tile, always visible) and the **Subscription page** (top tile, visible to any active subscriber).

**B. Consent + persistence**
- `CardRequest.consent_public` (default `False`). When `True` AND a non-empty user quote is provided, the backend persists to `share_quote_submissions` collection: `{id, user_id, first_name, variant, quote, consent_public, dedup_hash, created_at}`.
- Dedup hash is `sha256(user_id|variant|quote)[:32]` — repeat submissions are no-ops. The randomizer pool is never persisted.
- `SocialShareSheet.js` now renders a consent checkbox under the quote input: *"Let CarryOn use this quote publicly (website, marketing, social)."* Disabled until the user types something. Toggling it on a saved quote re-submits so the backend persists/unpersists accordingly.
- `CardResponse.submission_id` returned when persistence fires — makes future revocation trivial.

**C. Admin "Voices" tab (founder-only)**
- `GET /api/share-cards/admin/voices?q=...&variant=fc|sub&limit&offset` — searchable list.
- `GET /api/share-cards/admin/voices/export` — one-click CSV download.
- `DELETE /api/share-cards/admin/voices/{id}` — redaction (for offensive content).
- Frontend: `components/admin/VoicesTab.js` + registered at `/admin/voices` (MessageSquareQuote icon) in `AdminPage.js`. Shows Cormorant-serif quotes in grid cards, per-card Copy + Redact actions, FC/Subscriber filter chips, debounced search.

**Verified end-to-end**
- Backend: consent=true persists, consent=false does not, blank (random) never persists, dedup returns same id on repeat, admin list + CSV export + redact all return correct results.
- Frontend: Dashboard tile renders, Voices tab loads the 1 real consented quote from testing.

## Public "Voices" Page — Social Proof + Member Thank-You (Apr 17, 2026)
Extension of the Voices system — featured quotes are now surfaced on a public unauthenticated page.

**Backend**
- Added `featured: bool` column to `share_quote_submissions` (defaults to False).
- `GET /api/share-cards/voices/public` — no-auth endpoint serving only featured quotes (CDN-friendly payload).
- `PATCH /api/share-cards/admin/voices/{id}/feature?featured=true|false` — founder-only toggle.
- Admin list (`/admin/voices`) gained optional `featured_only` filter.

**Frontend**
- `components/admin/VoicesTab.js` — per-card **Star / "Feature"** button (toggles the public flag with toast feedback) + a **"Featured" filter chip** in the top bar.
- `pages/VoicesPage.js` — brand-new public page at `/voices`:
  - Cormorant Garamond hero: *"The words our members **chose for themselves.**"* (italic gold second line).
  - Subhead explains the source honestly: *"Not marketing copy. Not a testimonial request. Just their answer to a single question: what does CarryOn mean to you?"*
  - Grid of quote cards with FC / Subscriber chips (Crown for FC, Sparkles for subscriber), staggered fade-up animation.
  - Graceful empty state when no featured quotes exist yet.
  - Closing CTA: italic serif *"Your family deserves a plan, not a panic."* + gold "Start your CarryOn" button.
- Registered in `App.js` lazy-loaded public route.

**Verified**
- Public endpoint: returns empty list by default → after PATCH featured=true → returns the quote with no auth required (200).
- Public page: renders with 1 real featured quote from the live DB.

## Voices Founder Veto Power + AI Seed Quotes (Apr 17, 2026)
Closes the trust gap: founder now holds explicit approve/reject power over every user-submitted quote before it can appear publicly, AND the site is no longer empty on day one.

**Backend (`routes/share_cards.py`)**
- New per-submission field `approval_status` (`pending` | `approved` | `rejected`). User submissions now default to `pending` — they are NEVER surfaced on `/voices` or `HomeVoicesStrip` until the founder explicitly approves.
- New `is_seed: bool` flag — differentiates AI seed quotes from real member submissions for admin/analytics.
- `POST /admin/voices/seed` — idempotent upsert endpoint that writes 14 brand-voice AI quotes (7 FC + 7 subscriber) with fictional first names. Each seed gets a stable hash-derived id, `approval_status="approved"`, `is_seed=true`, and optional `featured=true`.
- `GET /admin/voices/pending-count` — returns count of quotes awaiting founder review (drives badge).
- `POST /admin/voices/{id}/approve?feature=true|false` — approves a pending quote, optionally flipping it featured in a single call.
- `POST /admin/voices/{id}/reject` — rejects a pending quote (kept in DB for audit, never shown publicly).
- Public `/voices/public` endpoint now filters strictly by `approval_status="approved"`. Admin list can filter by status (`pending`, `approved`, `rejected`, all).
- `_notify_founder_of_pending()` — Resend email fired on every new public-consent submission with a **direct link to `/admin/voices`**, gold CTA button, and the quote inline. Best-effort — never blocks the submission path.

**Frontend (`components/admin/VoicesTab.js`)**
- Pending-queue badge in header (`voices-pending-badge`) pulses amber when N > 0 and deep-links to the pending filter.
- Status filter chips (Pending / Approved / Rejected / All) with per-chip count for Pending.
- Per-card action bar:
  - **Pending** → Approve & Feature (gold), Approve only (ghost), Reject (red).
  - **Approved** → Feature/Unfeature toggle, Redact (delete).
  - **Rejected** → Restore to Pending, Redact.
- "AI-seeded" chip (Sparkles icon) on every seed card — makes the tip-jar origin unambiguous to the founder.
- Re-fetches both the list and pending-count on every state transition so the badge stays accurate.

**Verified end-to-end**
- DB: `total=16, seeds=14, approved=15, pending=0, featured=16, rejected=0`.
- Public `/voices` page renders all featured quotes with staggered fade-in, serif hero, FOUNDING MEMBER / MEMBER chips.
- Public `/api/share-cards/voices/public` returns 200 with seed + real quotes.
- Housekeeping: **65/65 PASS, 0 WARN, 0 FAIL.** `scripts/check.sh` returns **ALL CLEAR — SAFE TO PUSH**.

## Voices — One-Click Email Moderation (Apr 17, 2026)
Extension of the veto power workflow — founder can now approve/reject directly from the inbox with zero logins, ideal for launch-week submission spikes.

**Backend (`routes/share_cards.py`)**
- `_make_voice_action_token(submission_id, action)` — HS256-signed JWT with `purpose="voice_moderation_v1"`, bound to a single submission + single action, 7-day expiry. Uses the existing `JWT_SECRET`.
- `_decode_voice_action_token()` — strict validation: purpose match, action in `{approve_feature, approve, reject}`, submission id sanity-bounded.
- `GET /api/share-cards/voices/moderate?token=...` — public (no auth) endpoint. Validates token → performs the action → renders a branded Cormorant-serif HTML confirmation page (navy + gold, green for success, red for reject/error).
- **Idempotent**: replayed tokens against already-approved/rejected records return a soft "Already approved / Already rejected" confirmation, not an error.
- **Three actions** encoded in the token: `approve_feature` (live immediately on /voices), `approve` (approved, unfeatured), `reject` (hidden forever, kept for audit).
- `_notify_founder_of_pending()` updated to embed three primary action buttons (gold "Approve & Feature", emerald "Approve only", red "Reject") above the existing "Open Voices Admin" link. Each action URL carries its own signed token. Base URL comes from `FRONTEND_URL` env.

**Verified end-to-end**
- Approve-and-feature token: HTTP 200, branded "Approved & featured — {name}" page, DB flipped to `approval_status=approved, featured=true`.
- Idempotent replay of same token: HTTP 200, "Already approved — {name}" confirmation (no state change).
- Reject token: HTTP 200, "Rejected" page, DB flipped to `approval_status=rejected, featured=false`.
- Invalid/tampered token: HTTP 401, branded "Link no longer valid" page.
- Zero impact on existing `/admin/voices/{id}/approve` and `/reject` endpoints (in-portal founder actions still work).
- Housekeeping still **65/65 PASS, 0 WARN, 0 FAIL.**

## Voices — "Your voice is now public" Member Celebration Email (Apr 17, 2026)
Final leg of the Voices loop: the moment the founder approves a user-submitted quote (via portal API OR one-click email), the **member themselves** gets a celebratory email with their personalized share card and a one-tap share CTA.

**Backend (`routes/share_cards.py`)**
- New helper `_notify_member_approved(submission_id, featured=bool)`.
- Skips silently in all the right cases:
  - `is_seed=True` quote
  - Internal/test user_ids (`""`, `"__seed__"`, `"__test__"`)
  - Missing user or missing email
  - Already notified (checks `member_notified_at`)
- Regenerates the member's sharecard with their approved quote (FC or subscriber variant auto-selected) so the email contains the exact PNG they'll share.
- Branded email body: Cormorant serif headline "Thank you, {name}", the quote in italic, the inline sharecard image, two CTAs: "Share your voice" (deep-links to `/dashboard?share=voice`) and "See it on /voices".
- FC members get gold accent + "FOUNDING MEMBER" chip; subscribers get emerald accent + "CARRYON MEMBER" chip; featured quotes also show a "Featured on CarryOn" kicker.
- Flips `member_notified_at` via conditional `$exists: false` update so it's atomically one-shot — re-approval / double-trigger cannot produce a duplicate email.
- Wired into three approval paths: (1) `PATCH /admin/voices/{id}/approve` in-portal, (2) one-click `approve_feature` email link, (3) one-click `approve` email link. Never wired into `reject`.

**Frontend (`components/ShareYourCarryOn.js`)**
- Added a `useEffect` that checks `?share=voice` in the URL on mount. When present, auto-opens the share sheet AND strips the query param (so back-navigation doesn't re-trigger). One-tap share flow from the inbox.

**Verified end-to-end**
- DB: fake pending submission approved via one-click email → flipped to `approved=true, featured=true, approved_at=now, member_notified_at=now`. Resend log: `Email sent: 'Your voice is now public on CarryOn' → qa-test-notifier@example.com`.
- Idempotency: calling `_notify_member_approved` on an already-notified doc → no re-send (log confirmed silent skip).
- Seed skip: calling `_notify_member_approved` on `user_id="__seed__"` → silent skip.
- Housekeeping still **65/65 PASS, 0 WARN, 0 FAIL.** `scripts/check.sh` returns **ALL CLEAR — SAFE TO PUSH**.

## Home Voices Strip — Auto-Hiding Social Proof (Apr 17, 2026)
New component `components/HomeVoicesStrip.js`, placed on the public landing page between the "Free for Every American in Hospice Care" block and the "Readiness Starts Today" final CTA.

**Empty-state behavior (honesty first)**
- **0 featured quotes** → component renders `null`. Home page looks identical to today. No fake placeholders, no pool fallback. Zero risk of appearing astroturfed.
- **1 featured** → single static quote, no rotation, no pagination dots.
- **2+ featured** → auto-rotates every 8s with staggered fade-in. Pagination dots (gold active indicator) + next-arrow + pause-on-hover.

**Visual**
- Gold "IN OUR MEMBERS' WORDS" chip at top.
- Cormorant Garamond italic, ~32px → scales up on large screens.
- FC vs Subscriber chip colored gold / emerald with matching Crown / Sparkles icon.
- "Read more voices →" link leading to `/voices`.

**Verified both states**
- With 1 featured: strip renders with Rebekah's quote + FOUNDING MEMBER chip + link.
- With 0 featured (tested by toggling off and reloading): strip returns `null`, hospice section flows straight to final CTA.

## Upcoming Tasks (Launch Week — Wed–Fri)
- [Audit action] Fix FC `free_access` grant for late-added beneficiaries (🔴 15 min)
- [Audit action] Verify Stripe webhook signature enforcement (curl test, 5 min)
- [Audit action] Run FC installment-failure test (30 min)
- [Audit action] Implement Stripe reconciliation scheduler safety net (1 hr)
- [Optional] Seed default checklist on estate Paths 1 & 2 (20 min)
- [Optional] Add `(owner_id, status=pre-transition)` partial unique index (5 min)
- Set `SENTRY_DSN` and `REACT_APP_SENTRY_DSN` in prod env
- Run `k6 run load_tests/signup_and_dashboard.js` against staging; confirm thresholds
- (P0) Google Play Store Launch
- (P1) iOS Share Extension
- (P1) iOS Live Updates (Capgo)
- (P2) Readiness Scoring Policy Page

## Known Refactor Targets (Post-Launch, Low Urgency)
- `routes/auth.py` (1775 lines) → split into `auth/{login,register,otp,passkeys,sessions}.py`
- `routes/beneficiaries.py` (1440), `routes/estate_chat.py` (1250), `routes/financial_portal.py` (1010) — similar splits
- `pages/EstateChatPage.js` (2100+ lines) — break out voice, media, reactions
- `components/layout/MobileNav.js` (1313), `Sidebar.js` (1001)
- Consolidate 3 deploy configs (railway.toml / render.yaml / docker-compose.yml / Procfile) to single primary

## Recent Session Work Summary
See `CHANGELOG.md` for full chronological history if this file exceeds 700 lines.
