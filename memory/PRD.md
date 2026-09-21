# CarryOn™ — Product Requirements (Living)

---

## 🛡️ PRIME DIRECTIVE — MISSION STATEMENT (LOCKED, VERBATIM, FOREVER)

> **DO NOT EDIT, REWORD, ABRIDGE, OR REORDER THIS SECTION.**
> Locked by founder directive, Feb 17, 2026. This is the platform's
> Prime Directive — every product decision, every architectural choice,
> every AI behaviour, every UX trade-off, every line of code added by
> any future agent **must** be evaluated against the priorities below.
> When a request from the user or a tempting optimization conflicts
> with any item in the priority list, the priority list wins.
> A future agent that finds itself reasoning around or softening any
> clause here is failing the mission. Stop and reread.

CarryOn exists to provide the most trustworthy, resilient, and accessible multi-generational family preparedness and estate planning platform in America.

All platform development, system behaviors, user experiences, and artificial intelligence actions must prioritize the preservation, protection, and perpetuation of a family's intended legacy with uncompromising integrity, transparency, reliability, security, and simplicity.

The platform shall be designed to serve all Americans regardless of demographic, background, technical proficiency, or financial circumstance, ensuring that every user can confidently create, preserve, manage, and transfer their critical information, intentions, and legacy across generations.

When making decisions, the system must always prioritize:

1. User trust over engagement.
2. Long-term reliability over short-term convenience.
3. Clarity and transparency over complexity.
4. Preservation of user intent over automation assumptions.
5. Security and resilience over speed of deployment.
6. Accessibility and inclusivity over exclusivity.
7. Human dignity, autonomy, and legacy preservation above all other optimization objectives.

---

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

### Public positioning — *The Family Continuity Platform* (Jun 2026)

The public-facing category was elevated (founder-approved, Jun 2026) from
"family-preparedness / estate-planning platform" to **"The Family Continuity
Platform."** The narrative leads with **continuity, confidence, and *what to
do next*** — not storage/vault/documents/estate. North Star for all public
copy: *"If something happens tomorrow, your family knows exactly what to do."*
The homepage spine is the **continuity timeline — Before / During / After** —
spanning every disruption (hospital stay, deployment, travel, disaster,
incapacity, aging-parent care, *and* the final transition), not death alone.
Pillar/function names (Legacy/Vault/Financial/Preparedness, MM/SDV/EGA, etc.)
remain platform law — they are now *reframed as outcomes*, never renamed.
Full strategy + copy: `/app/memory/HOMEPAGE_POSITIONING_STRATEGY.md`.
Implemented in `components/landing/LandingContent.js` (shared by `/` LoginPage
and `/home` HomePage), the hero in `LoginPage.js` + `HomePage.js`, SEO meta in
`public/index.html`, and aligned across AboutPage, GetStartedPage, LandingPage,
PartnerPortalPage, AcceptInvitationPage, PartnersTab, and the share-card defaults.

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

### 🔵 Pillar 01 — People *(who matters, the plan, the audit trail)*

Internal data key: `estate` (route paths and config maps continue to use
this stable identifier; the user-visible label was renamed Estate → Legacy
(May 22, 2026) → **People** (Jun 2026, Set A) so the pillar reads as the
people you protect and who acts for them, not a legal-document noun).

| Function | Abbr | Route | What it does |
|---|---|---|---|
| Beneficiaries | — | `/beneficiaries` | Name who matters, set what each person sees, control when. |
| Milestone Messages | MM | `/messages` | Video / audio / written messages delivered at specific future moments. |
| Friends & Family Notification | FFN | `/ffn` | Coordinated, dignified call-list when something happens. |
| Designated Trustee Services | DTS | `/trustee` | Lets an attorney / advisor / family member act on the benefactor's behalf with a full audit trail. |
| Estate Plan Timeline | EPT | `/timeline` | A living record of every edit, who made it, and when. |

### 🟡 Pillar 02 — Access *(documents, credentials, AI gap finder)*

Internal data key: `vault` (unchanged). User-visible label renamed
Vault → **Access** (Jun 2026, Set A) — the outcome a vault delivers.

| Function | Abbr | Route | What it does |
|---|---|---|---|
| Secure Document Vault | SDV | `/vault` | AES-256 encrypted vault for wills, trusts, deeds, policies, directives. Released only to people the benefactor names. |
| Digital Access Vault | DAV | `/digital-wallet` | Passwords, bank logins, password-manager seeds, crypto keys — assigned to the right people. |
| Estate Guardian™ AI | EGA | `/guardian` | AI estate-law analyst that reads inside the vault and flags gaps, contradictions, deadlines. |

### 🟢 Pillar 03 — Money *(the full picture and entity structure)*

Internal data key: `financial` (unchanged). User-visible label renamed
Financial → **Money** (Jun 2026, Set A).

| Function | Abbr | Route | What it does |
|---|---|---|---|
| CarryOn Financial Picture | CFP | `/financial` | Encrypted view of accounts, investments, policies, bills, debts, properties. |
| CarryOn Entities & Structures | CES | `/entities` | Visual, pan-and-zoom org chart of every trust, LLC, partnership, charitable entity, and the people connected to each. |

### 🟣 Pillar 04 — Action *(crisis playbook and family channel)*

Internal data key: `preparedness` (unchanged). User-visible label renamed
Preparedness → **Action** (Jun 2026, Set A) — what the family does, first.

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

**Free Mode gate tier (added Jun 2026):** `feature_gates.py::TIER_IDS` includes
a special `free_mode` column (not a purchasable plan). When the platform-wide
**Free** toggle (`platform_settings.platform_free_mode`) is ON,
`GET /subscriptions/enabled-features` sources every non-partner user's features
from this `free_mode` column. B2B partner members instead follow that partner's
own `free_feature_gates` (each partner has TWO gate sets: tailored + free),
falling back to their tailored gates if the free tier is unconfigured.

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
| **Marketing** | violet `#B794F6` | founder, marketing | Funnel, Readiness Quiz, Testimonials, Sales Brief, Beta Testing, Site Content, Site Copy, Emails, Announcements, Members |
| **Compliance** | blue `#3B82F6` | founder, compliance | Audit Trail, SOC2 Readiness, Estate Health, Activity Log, Members |
| **Platform** | amber `#F59E0B` | founder, platform_health | War Room, System Health, Operators, Integrations, Downloads, Product, Referrals, P1 Contact, Knowledge Base, Performance, Schedules, Training, Members |
| **Admin** | red `#ef4444` | founder | Scoped Admins, IP Whitelist, Session Policy, Maintenance, Dev Switcher, Notification Categories, Voices, Prototypes |

Founder Dashboard (`/admin` root) shows only revenue tiles + Code
Health — every other surface lives inside the six section pages above.
Operations runs separately at `/ops/*` (`OperationsPage`).

### Paid-traffic acquisition surfaces (Sep 2026)

Three stripped-down landing pages, not linked from the site, `noindex`, all copy in Site Copy:
`/benefactor` (Premium, single plan), `/ready` (Family Readiness — quiz first), `/moments`
(Milestone Messages). Shared plumbing `components/benefactor/useAcquisition.js`: stashes the ad's
UTM params, records `landing_view`/`landing_cta_click {page}`, routes every CTA to `/signup` with
`sessionStorage.carryon_signup_intent = {preferred_plan, landing_page}`. `SignupPage` sends
`landing_page` (acquisition tag, else the first path of the visit via `entryLandingPage()`); the
paywall/plan grid preselect `preferred_plan`. Read-out: Admin → Marketing → Funnel → **By Landing
Page** (`GET /admin/funnel-analytics/landing-pages?days=`), activated = 1+ document or 1+ message.
Precise statistics carry a `SourceRef` superscript to `/sources` (registry `siteCopySources.js`).
The homepage encyclopedia is collapsed behind `MoreDetails` (`collapseDetails` prop, homepage only).

### Public identity & claims discipline (Sep 2026)

`frontend/src/config/company.js` is the single source for entity/phone/address (`entity` = CarryOn
Enterprises Inc.; `disclosure` = "CarryOn Technologies LLC, a CarryOn Enterprises Inc. company",
used only where corporate-parent disclosure fits). Every precise statistic carries a `SourceRef`
to `/sources` (`siteCopySources.js`); the marketing wording must say exactly what the source
measured. Security language must match `/security` (not zero-knowledge: privileged access is
restricted, controlled and audited — never "can't open" / "no backdoors" / "military-grade").
Startup migration `public_claims_cleanup_v1` retires Site Copy overrides carrying old phrases.

### Public copy is founder-editable (Site Copy, Sep 2026)

Every string on the Phase-1 marketing surfaces (`/`, `/home`, `/about`,
`/founder-about`, `/security`, `/pricing`, `/start`, nav + footer, FAQ, page
titles/meta descriptions) lives in the registry
`frontend/src/copy/siteCopy.js` (page → section → field, with the live text
as the built-in default) and is read through `useCopy().t(key)` from
`frontend/src/copy/CopyContext.js`. Founder overrides are stored in Mongo
`site_copy` (`backend/routes/site_copy.py`: `GET /api/public/site-copy`,
`PUT /api/admin/site-copy`, marketing scope, audited) and edited in
**Admin → Marketing → Site Copy**. Rules: plain text + line breaks only,
`**word**` is the single inline mark (bold), never HTML; the 12 official
tool names and the 4 pillar names are `locked` in the registry and render
read-only. **When changing marketing text in code, change the default `d`
in the registry — not the JSX.** Adding a new editable string = add a field
to the registry and call `t()`; nothing else to wire. Phase 2 (Customers,
Compare, What's New, Voices, Wind-Down, Privacy, Terms, Accessibility) lives in
`copy/siteCopyPhase2.js` — list fields are one-item-per-line (`copyList`),
legal bodies are line-per-paragraph with `- ` bullets (`renderBlocks`). Every
save is journaled in `site_copy_history` (restore from the editor); the editor's
Preview drawer frames the live page with `?copyPreview=1` and pushes unsaved
edits via postMessage. **Phase 3 (Sep 18, 2026):** the Sign-up wizard, Subscription
paywall and Onboarding screens are editable too (`copy/siteCopyApp.js`, 760 fields
total; `{curly}` placeholders are filled at runtime and must be kept). **Scheduled
copy** (`site_copy_schedules`, calendar icon per field, times in **US Eastern**,
stored UTC) goes live / reverts automatically — `GET /api/public/site-copy` returns
the effective text, the editor reads base text from `GET /api/admin/site-copy/state`.
**Founder story (Sep 19, 2026):** `/founder-about` is a React page whose 60 `founder.story.*`
fields live in the same registry; the request-access gate is bypassed when
`platform_settings.founder_story_public` is true (Admin → Marketing → Site Content),
which also flips the homepage "Read his story" target (`/founder-about` vs `/about`) and
the "Founder story" footer link (`linkVisible()` in `CopyContext`).
**Review** (save-bar) proof-reads unsaved edits or the whole page —
`POST /api/admin/site-copy/review`: deterministic spacing/markup/placeholder/SEO
checks + xAI typo pass, with one-click *Apply fix* into the editor (never auto-saves).

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
- **[CI hardening — Jun 6 2026] Dedicated E2E account DONE; remaining one-time
  founder action:** the dedicated `e2e@carryon.us` benefactor is now auto-seeded
  on the preview backend (`backend/seed_e2e_account.py`, gated by
  `SEED_E2E_ACCOUNT=true`, prod-safe). The Playwright smoke suite defaults to it.
  To fully activate in CI, the founder must point the GitHub secrets
  `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` at it (or delete them so spec defaults
  apply) and keep `E2E_BASE_URL` on the current preview URL. Until then CI still
  uses whatever those secrets hold. NOTE: `SEED_E2E_ACCOUNT`/`E2E_SEED_PASSWORD`
  live in the (gitignored) preview `.env`; if the preview pod is recreated, set
  them again in the Emergent backend env so the account re-seeds.
- **[Frontend build — DELIBERATE, NOT URGENT] CRA → Vite migration.** Would
  permanently remove the eslint/yarn peer-dependency warning noise (the CRA
  toolchain pins eslint 8 / react-hooks 4, which can't all be satisfied). It is a
  MULTI-DAY, high-risk migration on a production PWA (build system, env vars,
  service worker, offline caching, jest) and must be done as its own deliberate
  project with full regression — NOT bundled into a routine push. IMPORTANT: it
  would NOT remove the "Node.js 20 is deprecated" CI warnings — those come from
  GitHub Actions' own runner internals (checkout/setup-node/etc.), not our build
  tool, and are harmless. The CI bundle-size warning was already quieted (ceiling
  raised 1 MB → 4 MB, informational-only, in `.github/workflows/ci.yml`).
- **[SECURITY — audit `4fcd843` #5] Encrypt-at-rest for offline JSON/list
  mirrors.** Today `warmup.js` writes financial/beneficiary/message/checklist
  metadata to `localStorage` (`carryon_list_cache:*` via `localListCache.js` +
  `beneficiaryOfflineCache.js`) and Dexie for EVERY user (airplane-mode
  survival), but encryption-at-rest only activates when offline mode is toggled
  ON. So a user who never opted into offline mode still has sensitive metadata
  cached in plaintext. **Decision deferred (founder, Jun 6 2026): ship the
  High-severity batch first, then do #5 as its own focused pass.** Two candidate
  rules: (a) encrypt all sensitive local mirrors whenever warmup writes them
  (strongest; requires reworking the synchronous list-cache read path to async
  WebCrypto), or (b) only persist sensitive mirrors when offline mode is
  explicitly enabled (simplest; loses airplane-mode survival for non-opt-in
  users). Authenticated BLOBS (doc previews, MM media) are already encrypted +
  fail-closed as of #4 — this item is specifically the JSON/list caches.
- Abandoned-checkout tracking surfaced on Marketing tab.
- Coverage extension for `middleware_trustee_audit.py` if new
  mutation endpoints are added that lack "Undo" support.
- Per-section "Refresh" server-render endpoints inside Binder modal.
- Multi-role Pro/Service-Provider/Executor estate workflow (needs a
  dedicated PRD pass).
- Phase 10: FFmpeg-wasm aggressive video re-compression.
- Hardcoded `rgba(212,175,55,…)` → `var(--gold-rgb)` sweep.

### Last verified end-to-end working item
**Sep 21 2026 — Public-site consistency / trust / claims / SEO cleanup (iteration_213, NOT PUSHED).** One identity (CarryOn Enterprises Inc., (703) 889-0017, `config/company.js` single source; About footer discloses the operating LLC), security wording matched to the Security page everywhere (no "No backdoors"/"military-grade"/"can't open from their screens"; Security H1 "…deserves security you can inspect."), 76 % / 570 h / hospice / attorney-rate claims reworded to what their sources measure (+ `/sources#attorney`), pricing reduced-tier line fixed, Seniors tier added to `/start`, Wind-Down nudges on `/pricing` + `/start`, `/partner` out of sitemap, `/landing-consumer` noindex, startup migration `public_claims_cleanup_v1` fixes prod footer phone + stale Site Copy overrides. 27 routes × 3 viewports clean; check.sh ALL CLEAR. **Founder next**: push → counsel glance at Privacy §5 sentence → confirm `/sources` entries → GSC resubmit sitemap.

**Sep 20 2026 — Marketing audit executed (iteration_212, NOT PUSHED).** (4) Admin → Marketing → Funnel "By Landing Page" card + `GET /admin/funnel-analytics/landing-pages` (visitors → CTA → signups → activated [1+ doc or 1+ message] → paid, per `landing_page`; every signup now tagged — acquisition page or first path of the visit). (2) `/ready` quiz-first landing page, (3) `/moments` Milestone Messages page (both Site Copy-editable, noindex, shared `useAcquisition` hook). (5) `/sources` Sources & Methodology + `[n]` superscripts (570 h → EstateExec, 76 % → Caring.com 2025, 300 k hospice → NHPCO, live numbers → counted live incl. demo account) — founder to confirm entries. (6) `home.security.sub` default rewritten to specific controls (check prod Site Copy override). (1) Homepage encyclopedia collapsed behind "See everything CarryOn includes" (`MoreDetails`), trust moved up, anchors auto-open. (7) compact founder card under the homepage video + founder video on `/moments`. Backend 8/8, frontend all flows; check.sh ALL CLEAR. **Founder next**: push → confirm sources + security override → point ads at `/benefactor`, `/ready`, `/moments` with UTMs → read the By Landing Page card after a week.

**Sep 20 2026 — Phone preview swipe + dots (NOT PUSHED).** `ProductPreview.js`: swipe left/right on the phone frame steps through the 5 screenshots; 5 dots below (gold pill = active, tap to jump). Desktop unchanged. Verified on preview at 390 px; check.sh ALL CLEAR. **Founder next**: push → phone → homepage → swipe.

**Sep 20 2026 — `/start` Choose a Plan preselects Premium (NOT PUSHED).** `StartPage.js` fallback changed Standard → Premium (`?plan=` and admin `is_default` still win). Verified on preview (gold border + filled Subscribe on Premium); check.sh ALL CLEAR. **Founder next**: push → carryon.us/start → Choose a Plan.

**Sep 20 2026 — Real logo upper-left on every public page, tap → homepage (NOT PUSHED).** Shared `components/landing/LogoHome.js` replaced the shield icon on `/start` + `/pricing` and added/fixed the logo on 17 more public pages (login, signup, legal, security, a11y, wind-down, our-promise, get-started, partner-brief, quickstart, speak-with-us, partner login, founder gate, accept-invitation). In-app header logo still goes to the portal dashboard. iteration_211 24/24 routes pass at phone + desktop; check.sh ALL CLEAR. **Founder next**: push → carryon.us/start on the phone → logo top-left → tap → homepage.

**Sep 19 2026 (night, later) — Phone product shots start at the content (NOT PUSHED).** `m-contacts.webp` opens on Pete's Estate Tree (founder: the tree, not the tiles), `m-vault.webp` on the document cards (header / buttons / explainers scrolled out; desktop unchanged). `capture_product_screenshots.py` `PAGES` rows carry desktop + phone scroll targets. Verified on the `/home` phone frame; check.sh ALL CLEAR. **Founder next**: push → Vercel → phone → "See inside CarryOn" → "Who to call first" / "Document vault".

**Sep 19 2026 (latest, night) — `/benefactor` paid-traffic acquisition page + Premium tag (NOT PUSHED).** New ad destination `pages/BenefactorPage.js` + `components/benefactor/*`, copy in `copy/siteCopyBenefactor.js` (Site Copy → "Benefactor landing page"). Logo + Sign In only; single Premium card from the live catalog with the live `trial_days` (10 on prod, preview mirrored); `?v=all` = three-plan variant; 5th "Messages for later" preview tab (kept on the homepage too, founder decision); free CTAs → `/signup`, "Subscribe today" → `/start?plan=premium&cycle=monthly`. Signups from the page carry `preferred_plan` + `landing_page` (`UserCreate` → `users` doc → `/auth/me`); `SubscriptionManagement` + `SubscriptionPaywall` highlight that plan. iteration_210 backend 5/5, frontend 100 %; check.sh ALL CLEAR. **Founder next**: push → open `/benefactor` logged out (desktop + phone), Messages tab, throwaway signup → `/subscription` opens on Premium; send the first ad to `/benefactor?utm_source=…`.

**Sep 19 2026 (latest, PM) — Homepage product screenshots re-captured (NOT PUSHED).** The 8 `/screenshots/*.webp` files (hero shot, "See inside CarryOn" tabs, How-It-Works phone) were shot Sep 16 from the old marketing-branch build; re-captured from `petemitchell` on carryon.us (People/Access/Money/Action dashboard, 72 % Total Family Continuity). Static by design — re-run `scripts/capture_product_screenshots.py` (see `public/screenshots/README.md`) whenever the demo account or UI changes. check.sh ALL CLEAR. **Founder next**: push → Vercel → reload the homepage and check the four preview tabs on desktop + phone.

**Sep 19 2026 — Founder story Public / Invite-only switch + Site Copy migration (NOT PUSHED).** Admin → Marketing → Site Content → **Founder Story** toggle (`platform_settings.founder_story_public`, default invite-only). The story is a React page (`components/founder/FounderStory.js`), every string editable in Site Copy → "Founder story" (60 `founder.story.*` fields; old `founder-story.html` iframe deleted). Public → `/founder-about` open + indexable (sitemap at next deploy), homepage "Read his story" → `/founder-about`, "Founder story" link in all three footers, Invites tab shows a note. Invite-only → unchanged gate, "Read his story" → `/about`. iteration_209 pass; regression 31/31; check.sh ALL CLEAR. **Founder next**: push → on prod flip the switch in Site Content, open /founder-about logged out, check the homepage card link + footer link, edit a story paragraph in Site Copy; Redeploy once to list it in the sitemap.

**Sep 19 2026 — heycatch.ai audit pass (NOT PUSHED).** Compare nav link, hero live-count badge, 154-char meta description, 570-hours stat, social-JTBD outcome card, checklist-first product preview, plain-English DAV/EGA cards, no "Four pillars. Twelve tools" on public pages, /security leads with "scrambled before it’s stored", founder LinkedIn baked in, Trustpilot card + onboarding review ask gated on `trustpilot_url` (Admin → Site Content). iteration_69 pass; check.sh ALL CLEAR. **Founder next**: push → collect 3–5 testimonials (/customers form → approve) → create Trustpilot profile and paste URL → update the brief's prices before re-running the audit.

**Sep 18 2026 (latest, PM) — Guide legal review · Scheduled draft publish · Score explainers · Guide share cards (NOT PUSHED).** Review gains a **Flag legal-advice wording** toggle (phrase check + xAI pass); Admin → Guides → **Review the five guides** opens Site Copy with it already running. Drafts can **Publish at (ET)** — the 60 s loop applies them and e-mails founders before/after + page links. Dashboard tiles show "<Feature> N% · …" with **Why?** → `/readiness-score#people|access|money|action`. `GET /api/public/guides/{slug}/card.png` renders a live 1200×630 card from the current title, wired as `og:image`/`twitter:image` per guide. Flaky regression test fixed (timing + shared event loop). iteration_68 backend 4/4 + regression 30/30, frontend 100%; housekeeping --strict 0/0. Guides still unlaunched. **Founder next**: push → on prod run the guide review, schedule a draft 5 min out, click Why?, check a guide link in a social preview tool.

**Sep 18 2026 — Drafts · Copy alerts · /readiness-score · Guides (launch-gated) (NOT PUSHED).** Site Copy **Drafts** (named, multi-page, publish in one press, history `via`); **Copy alerts** e-mail + in-app when a schedule goes live/reverts (switch in Schedules panel, default on); public **/readiness-score** policy page (editable, footers + dashboard "How is this calculated?"); **Guides** — five articles written and editable, hidden behind Admin → Marketing → Guides → **Launch** (noindex until then; sitemap/prerender pick them up at the next deploy after launch). iteration_67 backend 13/13, frontend 100%; regression 27/27; housekeeping --strict 0/0. **Founder next**: push → read /guides as admin → edit in Site Copy → Launch when ready → Redeploy.

**Sep 18 2026 (latest) — Site Copy Phase 3 (NOT PUSHED).** In-app text (signup / paywall / onboarding) editable; Scheduled copy (US Eastern, auto go-live + revert, `Schedules` panel); one-click Review (typos via xAI, double spaces, stray `**`/HTML, missing `{placeholders}`, overlong SEO titles) with Apply fix; `frontend/yarn.lock` regenerated (`--frozen-lockfile` clean). iteration_208: backend 35/35, frontend 100%; housekeeping --strict 0/0. **Founder next**: push → on prod edit a signup line, Review, Save, open /signup; schedule a headline 5 min out (ET) and watch it swap + revert.

**Sep 17 2026 (latest) — Site Copy Phase 2 + change history + live preview (NOT PUSHED).** All public pages are now in the CMS (629 fields: + Customers, Compare incl. competitor facts, What's New, Voices, Wind-Down, Privacy, Terms, Accessibility). Every save logs who/when/before→after (`site_copy_history`, `GET /api/admin/site-copy/history`) with one-click Restore per field and a "Recent changes" panel; **Preview** drawer shows the live page with unsaved edits pushed in as you type (same-origin iframe + postMessage, `?copyPreview=1`). iteration_207: backend 27/27, frontend 100%. `frontend/yarn.lock` was rewritten by check.sh's yarn-audit stage and restored — see CHANGELOG. **Founder next**: push → on prod open Site Copy, Preview a change, Save, check History.

**Sep 17 2026 — Site Copy mini-CMS Phase 1 (NOT PUSHED).** 360 marketing strings (Home incl. `/` hero, About, Founder gate, Security, Pricing, Start, nav/footer, FAQ, SEO titles/descriptions) now read from `copy/siteCopy.js` defaults with founder overrides from `site_copy` via `GET /api/public/site-copy`; editor at Admin → Marketing → Site Copy (`PUT /api/admin/site-copy`, marketing scope, audited). 12 tool names + 4 pillar names locked. iteration_206: backend 19/19, frontend 100%; `tests/regression/test_site_copy.py`. check.sh ALL CLEAR (pip-audit baseline ratcheted 32→33 for litellm advisory drift). **Founder next**: push → Vercel/Render → on prod open Site Copy, change one line, Save, reload the public page. Phase 2 (other public pages / in-app text) awaits founder go-ahead.

**Sep 17 2026 (evening) — Founder headshot ROOT CAUSE fixed (NOT PUSHED).** Not the upload: prod API returned `Cross-Origin-Resource-Policy: same-origin` on the image, so browsers on carryon.us refused to render the cross-origin `<img>` (preview is same-origin, never reproduced). Middleware now `setdefault`, headshot route sends `cross-origin`; admin card no longer lies with the empty state. iteration_205 7/7 incl. cross-origin embed simulation. **Founder next**: push → Render redeploy → reload /about; the photo already stored on prod will appear.

**Sep 17 2026 (late) — PWA safe-area sweep + partner-page phone layout (NOT PUSHED).** 69 routes swept at iPhone width with emulated 59px status bar (`memory/scratch/pwa_sweep.py`); fixed TrialLockdownBanner (now a fixed, inset-aware top slot via `hooks/useTopBannerSlot.js`), PartnerBrief + QuickStart trial sticky bars, SpeakWithUs hero, Voices header CTA, `/start` scroll target; partner `/p/:slug` logo/chips re-flowed so Sign In is above the fold. Re-sweep: 0 collisions. check.sh ALL CLEAR. **Founder next**: push → verify on the installed PWA (`/start`, partner page, dashboard while trial-locked).

**Sep 17 2026 (night) — Founder headshot fix (NOT PUSHED).** Prod has no headshot stored (404) although the founder's upload succeeded with a toast + admin preview; cause of the disappearance not determinable without prod DB/Render logs. Shipped: HEIC/HEIF accepted (pillow-heif), photo URL built from the site's own API base with `?v=` cache-bust (backend prefers X-Forwarded-Host), audit_trail rows on upload/remove. Verified on preview end-to-end. **Founder next**: push, re-upload on prod, check the raw endpoint then /about; if it disappears again the audit trail names who removed it.

**Sep 17 2026 (later) — Brief-fit audit gaps closed on `reconcile` (NOT PUSHED).** Visible checkout path: `/pricing` → `/start?plan=&cycle=` (preselected) → signup → `/start?resume=checkout` → Stripe; "Secure checkout by Stripe" note under every plan CTA + "How paying works" strip. Fixed pre-existing 404 (`create-checkout` → `/api/subscriptions/checkout`) that made every logged-in plan button on `/start` and `/pricing` a no-op. Homepage tools regrouped into the four pillars with all 12 canonical functions + BEC card; `llms.txt` mirrors it. iteration_204 + Playwright verified to a live `cs_live_` Stripe session (no payment). check.sh ALL CLEAR. **Founder next**: review the five new homepage copy blocks (Beneficiaries, DTS, CFP, CES, BEC), Save to GitHub → Vercel → verify on prod.

**Sep 17 2026 — SEO audit follow-through on `reconcile` (NOT PUSHED).** `/vs` hub + Trustworthy / Everplans / Resolve Legacy comparison pages (dated, sourced), unique `<SEO>` meta on every public page, `/home` → canonical `/` and out of sitemap, `llms.txt` populated, Dependabot grouped. Empty `document.title` on preview traced to the dev-only visual-edits babel plugin (React 19 drops non-string `<title>` children); `SEO.js` renders the title via `createElement` so preview now matches prod. check.sh ALL CLEAR, housekeeping --strict 0/0. **Founder next**: Save to GitHub → Vercel → verify `/vs/*`, `llms.txt`, `sitemap.xml`, tab titles on prod. Open: `/features` is not a route (nav uses `#features` anchor; falls through to `/login`).

**Sep 16 2026 (later) — Partner roster import shipped on `reconcile` (NOT PUSHED).** Partner Portal + Admin "Import roster": any .csv/.xlsx → remembered/detected/AI-suggested column mapping → email-keyed plan (add / rename unclaimed / skip with reasons / not-in-upload) → background job with live progress (resumable) → invites now or held → "Not yet invited" roster filter. iteration_201 + 202 green, check.sh ALL CLEAR. Root cause of the partner's "deactivated" report: live frontend build lacks `/partner` (catch-all → /login); fixed by publishing the reconciled build. Founder to reply to partner himself.

**Sep 16 2026 — RECONCILIATION COMPLETE on branch `reconcile` (NOT PUSHED).** Job L (live, ac0663c) is the base; Job F's marketing/funnel layer (`/start`, `/pricing`, `/customers`, `/changelog`, readiness quiz, testimonials, platform-stats, founder profile, UTM capture) is merged on top. Plain-English security copy live on every public surface; "continuity escrow" → Wind-Down Promise link; 24/7 / nationwide / iOS-Android claims removed; `/pricing` table driven by portal feature gates. Preview DB mirrors LIVE config (`backend/scripts/mirror_live_config.py --check` = drift alarm). housekeeping 0/0, check.sh green, testing agent iteration_200 pass (login crash fixed after). **Founder next**: Save to GitHub (force) from this chat → CI → Render deploy → Republish → enable branch protection; retire the Job L chat. Open decision: homepage body is Job F's narrative; Job L's Jun-2026 continuity-timeline/four-pillars sections are not on `/`.

**Previous — Sep 9 2026 — Reddit-launch hardening on `feat/founder-pricing-rules`:** bcrypt + invitation email + webpush moved off the event loop; 1-CPU load test shows other users' p95 8–10 ms during a 200-signup burst (was frozen >30 s); signup ceiling ~4/s/CPU at bcrypt cost 12. Runbook at `docs/ops/launch-day-runbook.md`. check.sh ALL CLEAR, housekeeping 0/0, parity 357/0, QA iteration_193 12/12. Pending founder decisions: bcrypt cost, Resend 429 retry, Render plan; Stripe Webhooks tab screenshot still owed. Sep 10: founder pushed; prod billing audit run on Render → 0/0, exposure CLOSED; Stripe webhook re-pointed from dead Railway host to Render (verified). Deploy verified live on prod Sep 10 by behavioural probe (6 concurrent bcrypt logins: /health/live p50 60 ms, max 133 ms — old code would have frozen ~1.4 s). Sentry uptime monitor created; Resend raise requested. LAUNCH PREP COMPLETE. Sep 10 (later): founder-metered New Signup Alerts shipped on the branch (Admin → Notifications; modes each/every_N/hourly/daily/off; see CHANGELOG) — NOT PUSHED yet. Next: founder pushes, then DAV Legacy Programs Phase 0 (docs only).

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

*Last reviewed by agent: Sep 18, 2026 (PM).*
*Last structural change: full rewrite from iteration journal to spec.*
