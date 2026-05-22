# CarryOn™ — Product Requirements (Living)

> **Reset May 22, 2026.** The prior 3,057-line PRD was an iteration journal,
> not a spec. Archived verbatim at `/app/memory/PRD_archive_2026-02-17.md`.
> Day-by-day completion history lives in `/app/memory/CHANGELOG.md`.
> Persistent operating rules live in `/app/memory/AGENT_RULES.md`.
> This file describes **what CarryOn is and what it must remain**, derived
> from reading the actual code in `/app/frontend/src/**` and
> `/app/backend/routes/**`, not from prior agent claims.

---

## 🔒 Two Inviolable Operating Rules

Every agent, every session, every commit. No exceptions.

### Rule 1 — The founder never tests in preview.

The user **only ever tests on the live platform** at `https://app.carryon.us`
(and the iPhone PWA installed from that origin) **after** pushing to GitHub
and waiting for Vercel (frontend) and Render/Railway (backend) to fully
deploy.

When the user reports "worked / broken / I just tested," they mean
**production**, not the preview pod. Never ask them to verify on preview.
Never assume preview behaviour reproduces production behaviour. Plan your
work, your follow-up questions, and your verification asks around that
workflow.

The PWA is a fully isolated standalone surface — no URL bar, no DevTools,
no `javascript:` paste, no `?debug=` query strings. All diagnostics must
be reachable by **tapping inside the rendered app**.

### Rule 2 — Zero-WARN housekeeping is the bar for "done."

Before any handoff, finish summary, or `Save to GitHub`, run from the repo
root:

```bash
bash /app/scripts/check.sh         # canonical pre-push gate
# OR for raw audit:
bash /app/housekeeping.sh --strict
```

Both must report **0 WARN / 0 FAIL**. Every WARN is fixed in the same
session it appears in — never reported, never deferred, never explained
away. The user's words (Apr 17, 2026):

> *"These things are easy to fix. I want them always fixed! I didn't have
> you build the housekeeping script for you to simply identify things, it
> is meant for you to identify AND FIX things before I push."*

The `housekeeping.sh` script is the canonical contract. If a check exists
in it, that's product law — including SOC 2 hygiene, route-policy coverage,
critical-pathway invariants, accessibility floors, and Mongo projection
safety. New invariants the founder cares about get added there.

---

## What CarryOn Is

CarryOn is a **family-preparedness platform** sold business-to-business
(B2B-first) and business-to-consumer (B2C, deferred). It exists so that
when a member of a household dies, becomes incapacitated, or is caught in
a regional disaster, the rest of the family has **immediate, organized,
verified access** to everything they need to act — without a lawyer in
the room, without a panic search through a filing cabinet, and without
guessing what the deceased would have wanted.

### The strategic promise (what's pitched, what's true)

1. **The benefactor builds it once, while alive.** Documents, financial
   picture, contingency plans, milestone messages, beneficiary
   designations — all entered, encrypted, organized, and pre-shared with
   the people who will need them.
2. **The platform notifies the right people at the right time.** Some
   things unlock pre-transition (essential documents); most unlock at
   transition (verified by certified death certificate); some are
   triggered by life events (birthdays, weddings, graduations).
3. **AI augments, never replaces.** Estate Guardian™ AI reads the vault
   and finds gaps. Beneficiary Estate Concierge AI answers heir
   questions in plain English with citations. Both run against the
   benefactor's encrypted documents — neither model is trained on them.
4. **The family never has to "figure it out."** The Immediate Action
   Checklist tells survivors exactly what to do, in what order, with
   the documents already attached.

### Audience

- Primary buyer: B2B partners (employer benefits, military / first-
  responder organizations, hospice networks, senior-living operators,
  estate attorneys, financial planners, life-insurance carriers).
- Primary end user: family member age **40+** managing a household.
  Most wear reading glasses. The readability floor is enforced in code:
  **12 px is the minimum; if text is 12 px it MUST be bold.** Reading
  copy is 13 px+. This is a credibility input, not an aesthetic choice.

### What the platform is NOT

- Not a will-drafting service. Not a legal-advice service. Not an
  estate-planning attorney substitute.
- Not a generic password manager. (DAV is one feature, not the
  product.)
- Not a social network. Not a journaling app. Not a chatbot.
- Not a backup service for the benefactor's own files for their own
  use — the unit of value is **what survives them**.

---

## The Four Pillars of Total Estate Readiness

Everything CarryOn does ladders to one outcome: **Total Estate Readiness** for
the family. Four pillars hold that up. Each pillar bundles a small set of
focused **functions** (the actual feature surfaces — MM, SDV, EGA, etc.).

Source of truth for the function-level matrix:
`/app/backend/routes/feature_gates.py::PLATFORM_FEATURES`. Source of truth
for the pillar grouping: `/app/frontend/src/config/benefactorSections.js`
(used by the benefactor sidebar) and
`/app/frontend/src/components/landing/LandingContent.js::PILLARS` (homepage
narrative). **Canonical names + abbreviations are platform law** — see
`AGENT_RULES.md` Rule -2.

### 🔵 Pillar 01 — Legacy *(people, plan, audit trail)*

Internal data key: `estate` (route paths and config maps continue to use
this stable identifier; only the user-visible label was renamed from
"Estate" to "Legacy" on May 22, 2026 so the pillar reads as the broader
*leaving-behind* concept rather than the legal-document narrow noun).

| Function | Abbr | Route | What it does |
|---|---|---|---|
| Beneficiaries | — | `/beneficiaries` | Name who matters, set what each person sees, control when. |
| Milestone Messages | MM | `/messages` | Video / audio / written messages delivered at specific future moments. |
| Friends & Family Notification | FFN | `/ffn` | Coordinated, dignified call-list when something happens. |
| Designated Trustee Services | DTS | `/trustee` | Lets an attorney / advisor / family member act on the benefactor's behalf with a full audit trail. |
| Estate Plan Timeline | EPT | `/timeline` | A living record of every edit, who made it, and when. |

### 🟡 Pillar 02 — Vault *(documents, credentials, AI gap finder)*

| Function | Abbr | Route | What it does |
|---|---|---|---|
| Secure Document Vault | SDV | `/vault` | AES-256 encrypted vault for wills, trusts, deeds, policies, directives. Released only to people the benefactor names. |
| Digital Access Vault | DAV | `/digital-wallet` | Passwords, bank logins, password-manager seeds, crypto keys — assigned to the right people. |
| Estate Guardian™ AI | EGA | `/guardian` | AI estate-law analyst that reads inside the vault and flags gaps, contradictions, deadlines. |

### 🟢 Pillar 03 — Financial *(money picture and entity structure)*

| Function | Abbr | Route | What it does |
|---|---|---|---|
| CarryOn Financial Picture | CFP | `/financial` | Encrypted view of accounts, investments, policies, bills, debts, properties. |
| CarryOn Entities & Structures | CES | `/entities` | Visual, pan-and-zoom org chart of every trust, LLC, partnership, charitable entity, and the people connected to each. |

### 🟣 Pillar 04 — Preparedness *(crisis playbook and family hotline)*

| Function | Abbr | Route | What it does |
|---|---|---|---|
| Immediate Action Checklist | IAC | `/checklist` | Step-by-step playbook for the first hours, days, and weeks. Auto-built from the vault by EGA, fully customizable. |
| CarryOn Contingency Protocols | CCP | `/connected-protocol` | Pre-authored response plans for medical, disaster, incapacity, transition. |
| Estate Communications Tool | ECT | `/estate-chat` | Phone-number-free family messaging that works from any device. |

### Not a pillar — beneficiary-side capability

| Function | Abbr | Route | What it does |
|---|---|---|---|
| Beneficiary Estate Concierge | BEC | `/beneficiary/concierge` | After transition: an AI concierge for beneficiaries that answers plain-English questions, grounded only in the documents the benefactor specifically released to them, with inline citations. |

### Foundational primitive (not a pillar tile, but everything ties to it)
**Beneficiaries** — every pillar and function is built around the people the
benefactor has named, with separate per-person permissions. The benefactor
decides who sees what, and when.

**Trustee Mode Access (TMA)** is a delegation primitive that layers across
all four pillars — a designated trustee can step into the benefactor's
account with a full audit trail. It is not a function inside any one
pillar; it is a way of using the platform on behalf of someone else.

`default OFF` means the feature exists in code and tests, but each tier
must be toggled ON by the founder in **Admin → Finance → Subs → Feature
Gates** before users on that tier see it. This is a deliberate revenue
lever, not a bug.

### Tier inheritance — the one rule that touches every feature

The benefactor chooses the tier. The beneficiary inherits it. The
beneficiary never picks their own. Enforced in
`backend/routes/feature_gates.py::get_user_enabled_features` and
`backend/routes/section_permissions.py::feature_access`. Any change to
beneficiary feature visibility must respect this rule.

---

## Subscription Tiers (canonical order)

`backend/routes/subscriptions/plans.py::PLAN_ORDER`. This order is
re-applied on every settings load — the DB cannot drift out of it.

1. **Premium** — full pillar access, family plan eligible
2. **Standard** — core + selected extras
3. **Base** — core pillars (MM / SDV / IAC) + supporting
4. **Military / First Responder** — discounted, verified at signup
5. **Veteran** — discounted, verified
6. **Seniors** — discounted, verified
7. **New Adult** — 18–25, verified
8. **Hospice** — free for any American in hospice care
9. **Enterprise** — B2B contracts, partner-gated

When a paywall renders more cards than fit one row, **orphan rows must
center** (symmetry is non-negotiable for live pitches). Implementation:
`flex flex-wrap justify-center` with explicit `w-[calc(N%-X)]` widths.

---

## Architecture (as it stands, May 2026)

### Stack
- **Frontend**: React 19 + Capacitor 8 (iOS / Android) + Vercel
- **Backend**: FastAPI (`server.py`) + Motor/MongoDB async driver, deployed
  on Render (primary) / Railway (per CHANGELOG history)
- **Database**: MongoDB Atlas
- **Offline**: Dexie-backed IndexedDB (`/app/frontend/src/offline/`),
  three-way flag `off | shadow | on`, AES-256-GCM at rest, outbox queue,
  conflict resolution UI. Default OFF.
- **Auth**: JWT in `localStorage.carryon_token`. Single-session
  enforcement. WebAuthn passkeys supported (browser-native, not the
  App-Store-gated Capacitor biometric plugin).

### Backend service shape (`/app/backend/routes/`)

Packages (multi-module): `admin/` · `auth/` · `beneficiaries/` ·
`estate_chat/` · `financial_portal/` · `share_cards/` · `subscriptions/`.

Top-level pillar / surface routes: `documents.py` (SDV), `messages.py`
(MM), `guardian.py` + `guardian_*.py` (EGA), `checklist.py` (IAC),
`connected_protocol.py` + `ccp_depth.py` (CCP), `digital_wallet.py` (DAV),
`ffn.py` (FFN), `beneficiary_concierge.py` (BEC), `trustee_access.py`
(TMA), `dts.py` (DTS), `timeline.py`, `transition.py`.

Cross-cutting: `feature_gates.py` (the tier × feature matrix),
`section_permissions.py` (per-beneficiary access map, AND-gated with
the tier matrix), `notifications.py` + `ws_notifications.py`,
`uploads_chunked.py` (resumable encrypted uploads),
`emergency_access.py`, `webauthn.py`, `referrals.py`, `funnel.py`,
`partner_brief.py`, `share.py` + `estate_binder.py` (public share links).

All routes mount under `/api` (and a `/api/v1` mirror). Strict CSP /
HSTS / no-store on sensitive JSON, X-Request-ID middleware, MongoDB-
backed sliding-window rate limiter + scheduler lock for multi-pod
safety.

### Frontend surface (`/app/frontend/src/pages/`)

**Public**: `LoginPage`, `SignupPage`, `LandingPage` (archived at
`/landing-consumer`), `HomePage` (`/home`), `AboutPage`,
`FounderAboutPage`, `VoicesPage`, `PartnerBriefPage`, `PartnerPortalPage`,
`SecurityPage`, `WindDownPromisePage`, `PrivacyPolicyPage`, `TermsPage`,
`SpeakWithUsPage`, `SharePage`, `SharedBinderPage`, `SharedPlanPage`,
`AcceptInvitationPage`, `TrusteeClaimPage`, `CreateEstatePage`,
`GetStartedPage`, `OnboardingPage`.

**Benefactor portal** (gated by `FeatureGate` per pillar):
`DashboardPage`, `VaultPage`, `MessagesPage`,
`EditMilestoneMessagePage`, `BeneficiariesPage`, `GuardianPage`,
`ChecklistPage`, `ConnectedProtocolPage`, `EstateChatPage`,
`DigitalWalletPage`, `FFNPage`, `FinancialPortalPage`, `TrusteePage`
(DTS), `LegacyTimelinePage`, `TransitionPage`.

**Beneficiary portal** (`/beneficiary/*`): `BeneficiaryHubPage`
(orbit visualization — **critical pathway**, see AGENT_RULES Rule -3),
`BeneficiaryDashboardPage`, `BeneficiaryConciergePage` (BEC),
`BeneficiaryVaultPage`, `BeneficiaryMessagesPage`,
`BeneficiaryChecklistPage`, `BeneficiaryCCPPage`,
`BeneficiaryFinancialPage`, `BeneficiaryEntitiesPage`,
`BeneficiaryGuardianPage` (legacy — now redirects to BEC),
`BeneficiarySettingsPage`, `MilestoneReportPage`,
`UploadCertificatePage`, `CondolencePage`, `PreTransitionPage`.

**User chrome**: `SettingsPage`, `SubscriptionPage`,
`FoundersCirclePage`, `SecuritySettingsPage`, `SupportChatPage`,
`OfflineDebugPage`.

**Admin (founder + scoped)**: `AdminPage` with six expandable sections
defined in `/app/frontend/src/config/adminSections.js`:

| Section | Color | Scopes | Tabs |
|---|---|---|---|
| **Operations** | gold `#d4af37` | founder, ops_manager, ops_team | Users, Invites, TVT, DTS, Support, Verify, Milestones, Escalations, Ops Dashboard, Templates, Team Chat, Members |
| **Finance** | emerald `#22C993` | founder, finance | Subs, Partners, Rules, Revenue, Launch, Grace Periods, Trials, Members |
| **Marketing** | violet `#B794F6` | founder, marketing | Funnel, Sales Brief, Beta Testing, Site Content, Emails, Announcements, Members |
| **Compliance** | blue `#3B82F6` | founder, compliance | Audit Trail, Estate Health, Activity Log, Members |
| **Platform** | amber `#F59E0B` | founder, platform_health | War Room, System Health, Operators, Integrations, Downloads, Product, Referrals, P1 Contact, Knowledge Base, Performance, Schedules, Training, Members |
| **Admin** | red `#ef4444` | founder | Scoped Admins, IP Whitelist, Session Policy, Maintenance, Dev Switcher, Notification Categories, Voices, Prototypes |

Founder Dashboard (`/admin` root) shows only revenue tiles + Code
Health — every other surface lives inside the six section pages above.
Operations runs separately at `/ops/*` (`OperationsPage`).

### Critical pathways (housekeeping FAIL if broken)

Enumerated in `housekeeping.sh` under `CP. Critical Pathway Invariants`
and `AGENT_RULES.md` Rule -3. The one currently enforced:

- **Beneficiary Hub (Estate Plan Network orbit)** at `/beneficiary`.
  User-in-center, benefactors on rings 0–3 keyed to relation. Reachable
  from sidebar "My Beneficiary Portal," mobile drawer, FamilyTree estate
  click, direct URL, and "All Estates" back button. Pathway uses
  `OrbitVisualization` + `/api/beneficiary/family-connections`. **Do not
  delete, rename, or consolidate any part of this without explicit user
  instruction naming the pathway.**

---

## Operational Rules of the Road

These are the things that, if violated, cost the founder a pitch or a
sale. Documented here so they survive forks.

### What ships only after the founder asks for it
- Founder-portal / admin-surface changes.
- Feature-gate toggles (the founder controls per-tier visibility from
  Admin → Finance → Subs).
- Marketing copy, pillar names, pillar order, pricing copy.
- Critical-pathway components, routes, or buttons.

### What never ships
- "Potential improvements," follow-up suggestions, or proactive
  refactors. The founder drives. (Verbatim, Apr 29, 2026: *"Stop
  suggesting things, stop recommending things, let me drive."*)
- Default values silently filled in for ambiguous requirements. Ask one
  crisp question; wait.
- Scope extrapolation. "Remove X from screen Y" means remove X from
  screen Y. Nothing else.
- Renamed / paraphrased / cute-marketing pillar names. Use the exact
  table above.
- Backwards-compatibility shims for code that was just changed.
- Code outside the founder's stated request, even if it "looks wrong."

### What requires explicit user instruction
- Refactoring any of: `EntityOrgChart.js` (~2,536 LOC),
  `MessagesPage.js` (~1,925), `BeneficiariesPage.js` (~1,747),
  `checkout.py` (~1,630). These are flagged but **must not be touched
  before a live pitch**.
- Any modification to authentication (login, registration, password
  hashing, JWT, password reset, admin seeding, brute force, OAuth) —
  call `integration_playbook_expert_v2` first.
- Any modification to Stripe / payments / Founders Circle / IAP flows.
- Any deletion under `/pages/beneficiary/` or modification to
  `App.js` route definitions / `Sidebar.js` / `MobileNav.js` /
  `FamilyTree.js` — run housekeeping before and after, CP block must
  pass both times.

### Hard-and-fast technical rules (code-enforced)
- **MongoDB**: always exclude `_id` in projections OR map to Pydantic
  response models. ObjectId is not JSON-serializable. Housekeeping
  enforces this.
- **Datetimes**: `datetime.now(timezone.utc)`, never `datetime.utcnow()`.
- **Backend routes**: every API path is `/api`-prefixed.
- **Env vars**: all secrets and URLs from `.env`. Never default
  fallbacks. `MONGO_URL` and `DB_NAME` keys must not be renamed.
  `REACT_APP_BACKEND_URL` is the only frontend backend reference.
- **No emojis in icons** — use `lucide-react` or FontAwesome.
- **data-testid** on every interactive element and every element
  showing critical info. Kebab-case, function-descriptive.

### Third-party integration discipline
Always route through `integration_playbook_expert_v2` before writing
integration code. Currently LIVE (per `/app/backend/.env` and
`/app/frontend/.env`):
- xAI (Grok) via Emergent LLM Key
- Resend (transactional email)
- Stripe (payments)
- Google Places API
- AWS S3 — bucket `carryon-vault` in **Emergent-managed AWS account**
  (NOT the user's personal account). Configure CORS / lifecycle via
  `python3 /app/backend/scripts/configure_s3_cors.py`, never the AWS
  console.
- Twilio (SMS — A2P 10DLC pending)
- Sentry (env-gated on both ends)
- Capacitor / Capgo (mobile shell + live updates — gated on App Store
  build)
- Apple IAP (pending Apple Developer Agreement)

---

## Canonical Test Accounts

Full detail in `/app/memory/test_credentials.md`. Quick reference:

| Account | Email / Username | Password | Role | Where |
|---|---|---|---|---|
| Founder admin | `founder@carryon.us` | `CarryOntheWisdom!` | admin | prod + preview |
| Pete Mitchell (LIVE benefactor — **NOT admin**) | `info@carryon.us` | `Demo1234!` | benefactor | prod + preview |
| Barnet | `barnetharris` (username) | `Blh9170873` | beneficiary | prod |
| Megumi | `megumiharris@gmail.com` | `Question2711` | benefactor | prod |
| Trustee (legacy) | `trustee_screenshot` (username) | `TPass1234!` | TMA grant for Pete | preview only |

If any agent flags `info@carryon.us` as admin, that is a stale-data
bug — fix it in the preview DB immediately (snippet in
`AGENT_RULES.md`).

---

## What the Code Looks Like Today (architectural cheatsheet)

- **Backend monoliths still resident** (refactor only on explicit
  instruction, never before a pitch): `EntityOrgChart.js`,
  `MessagesPage.js`, `BeneficiariesPage.js`,
  `subscriptions/checkout.py`. Targets identified; do not touch
  unprompted.
- **Offline-first**: nine phases shipped, default OFF. Owns its own
  IndexedDB, outbox, encryption-at-rest, conflict UI, chunked uploader.
  Flag at `localStorage.carryon_offline_v1`.
- **Build versioning**: `<BuildTag />` globally tracks the deployed
  build so Vercel rollouts are visually confirmable.
- **Telemetry**: download outcomes (iOS-honest), notification health,
  funnel events, referral attribution all stream to MongoDB and surface
  in admin tabs.

---

## Current Operational State (May 22, 2026)

### Open (P1) — blocked on third-party / founder action
- **Apple IAP**: pending Apple Developer Agreement approval.
- **Twilio SMS OTP**: pending A2P 10DLC campaign approval.
- **iOS Live Updates (Capgo)**: pending App Store build.
- **iOS Share Extension**: pending App Store build.

### Backlog (P2 — pull when calm, do NOT pre-empt the founder)
- Abandoned-checkout tracking surfaced on Marketing tab.
- Coverage extension for `middleware_trustee_audit.py` if new
  mutation endpoints are added that lack "Undo" support.
- Per-section "Refresh" server-render endpoints inside Binder modal.
- Multi-role Pro/Service-Provider/Executor estate workflow (needs a
  dedicated PRD pass).
- Phase 10: FFmpeg-wasm aggressive video re-compression.
- Hardcoded `rgba(212,175,55,…)` → `var(--gold-rgb)` sweep.

### Last verified end-to-end working item
- Admin Portal six-section restructure (Operations / Finance /
  Marketing / Compliance / Platform / Admin) with gradient headers and
  opaque high-contrast pill navigation. PWA Trustee Mode banner
  spacing tuned to iOS safe-area. Build deploys clean; housekeeping 0
  WARN / 0 FAIL.

---

## How to Use This Document

- **Pick up a new task**: read this file end-to-end. It is short on
  purpose. If something specific to a past iteration matters, read
  `/app/memory/CHANGELOG.md` for that date.
- **Add a feature**: ask the founder. Then add the feature key to
  `PLATFORM_FEATURES` in `feature_gates.py` if it's a pillar; add the
  route under `/api`; gate the frontend route with `<FeatureGate>` if
  it's tier-controlled; add a `cp_check` line in `housekeeping.sh` if
  it becomes a critical pathway.
- **Fix a bug**: reproduce it first. The founder reports against
  production. If you cannot reproduce on preview, ask for a screenshot
  or steps; do not "fix" on speculation.
- **Finish a session**: run `bash /app/scripts/check.sh`. If it
  doesn't say `ALL CLEAR — SAFE TO PUSH`, you are not done. Append a
  dated entry to `CHANGELOG.md` describing what shipped. Update
  `test_credentials.md` if any auth credentials changed. Do not update
  this file unless the architecture, ten-pillar taxonomy, tier order,
  inviolable rules, or strategic direction has changed.

---

*Last reviewed by agent: May 22, 2026.*
*Last structural change: full rewrite from iteration journal to spec.*
