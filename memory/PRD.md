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

## Varsity Serif Treatment — Pillars & Heroes (Apr 17, 2026 — second pass)
- Applied Cormorant Garamond (`var(--serif)`) to trust-carrying headers:
  - HomePage hero: "Every American Family. *Ready.*" (italic gold on "Ready")
  - LoginPage hero (both desktop + mobile variants)
  - LandingContent section h2s: "More Than Estate Planning.", "Valuable Right Now.", "Nine Pillars of Family Readiness.", "Built for Real Families.", "Family Readiness in Five Steps.", "Your Family's Privacy Is Non-Negotiable.", "Free for Every American in Hospice Care.", "Readiness Starts Today."
  - Each pillar title (9 titles) + "Comprehensive Family Preparedness." end-state + italic "They're ready. Because you prepared." sign-off
- Body text, buttons, UI controls remain Inter for clarity.
- Weight downgraded from bold → semibold/medium for the "editorial confidence" look.

## Housekeeping WARN Cleanup (Apr 17, 2026)
Per user mandate, housekeeping WARNs are now fix-before-finish:
- **Mongo projection safety (A1.2)**: Added `"id": 1` to `founders_circle` projection in `routes/beneficiaries.py:_grant_fc_free_access_if_applicable`.
- **Min font size / iOS accessibility**: Bumped 4 instances of `text-[10px]` → `text-[11px]` across `PrototypesTab.js`, `LaunchWarRoomTab.js` (2 places), and `AdminCommandPalette.js`.
- Result: `bash /app/housekeeping.sh` now reports **66 PASS, 0 WARN, 0 FAIL**. `scripts/check.sh` says **ALL CLEAR — SAFE TO PUSH**.

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
