# CarryOn™ — Product Requirements Document

## Original Problem Statement
CarryOn is a secure, AI-powered estate planning platform for American families. It helps users organize critical end-of-life documents, milestone messages, and digital asset credentials, encrypted and stored securely for beneficiaries to access when the time comes.

## Core Architecture
- **Frontend**: React 19 (CRA via Craco) + Tailwind CSS + Shadcn/UI — 32 pages, 74 components, 65 packages
- **Backend**: FastAPI (Python 3.11) — 170 endpoints, 26 route modules, 7 services, modular architecture
- **Database**: MongoDB Atlas (production) / local MongoDB (preview) — 35 collections
- **Storage**: AWS S3 (carryon-vault, us-east-2)
- **AI**: xAI Grok-4 (Estate Guardian AI)
- **Payments**: Stripe (checkout, subscriptions, proration)
- **Email**: Resend (OTP, notifications, digests)
- **Hosting**: Vercel (frontend) + Railway (backend)
- **Mobile**: Capacitor 6 → Codemagic → TestFlight
- **CI/CD**: GitHub Actions (lint + build)

## Subscription & Access Model
- **Free download** from App Store
- **30-day free trial** on signup — full access to all features
- **After trial expires (no subscription)**:
  - **Benefactor**: Read-only. Can view existing documents, messages, checklist. CANNOT upload new documents, create new messages, or add checklist items.
  - **Beneficiary**: Can view Living Will/Healthcare Directive and Power of Attorney regardless of subscription. CANNOT upload death certificate to trigger transition until benefactor's estate has active subscription.
- **Active subscription**: Full access restored
- **B2B/Enterprise codes**: Override subscription requirement (free_access flag)
- **Enforcement**: `guards.py` — `require_active_subscription` dependency checks trial, subscription, beta mode, and overrides. Applied to POST endpoints for documents, messages, checklist, and death certificate upload.


## Current Session (Feb 28 – Mar 2, 2026)

### Completed
- In-app PDF viewer (react-pdf floating tile with zoom/navigation)
- Document card thumbnails (lazy-loaded PDF first-page + image previews)
- Subscription UI redesign (role-aware, billing toggle, Stripe checkout)
- Beneficiary locked tier logic (based on benefactor's majority plan)
- Military/Hospice verification flow (upload → admin approve → notify via support)
- Subscription proration (downgrades → customer service, upgrades → Stripe)
- Beneficiary payment lifecycle (DOB auto-detection, 30-day grace periods)
- Death certificate → seal & release flow (grace periods auto-created)
- Mobile refinements (opaque header, safe-area, onboarding position)
- 2026 premium design palette (teal-navy + warm gold, liquid-glass cards)
- Readiness gauge labels (Getting Started / Building / Strong / Protected)
- Getting Started wizard (individual tiles, auto-pop on complete, auto-restore on 0)
- 3-2-1 countdown for video/voice recording
- Customer Service chat for beneficiaries
- Face ID (native Capacitor app via iOS Keychain) + iOS autofill for PWA
- PWA manifest (standalone mode, no Safari toolbar)
- Admin dashboard actionable metrics (Needs Attention + Platform Overview)
- SOC 2 audit (15 controls, all passing)
- Deep lint (Python ruff + JS ESLint, all clean)
- Monolith organization (server.py → middleware.py + schedulers.py)
- Security hardening (rate limiting, CSP, file upload validation, error handling)
- HIPAA fully removed, SOC 2 + GDPR only
- .gitignore cleanup (multiple times)
- Domain migration (carryon.us → Vercel)
- CI/CD fixes (GitHub Actions, Codemagic Xcode 26.3)

### Pending / Backlog
- P0: Mobile App rubber-banding/blank screen (Codemagic build validation pending)
- P1: In-App Viewer for PNG Images (triggers download instead of viewer)
- P1: VAPID keys on Railway for push notifications
- P1: Codemagic build for native Face ID testing
- P2: Animated logo (awaiting asset)
- P2: SMS OTP via Twilio (awaiting A2P 10DLC)
- P2: ISO 27001 full compliance
- P2: Beneficiary Hub & Gentle Intro Verification (user testing pending)
- P3: Redis-backed rate limiting

### Session Mar 2, 2026
- Fixed Admin TVT card text bleed (long filenames now truncate with ellipsis)
- Fixed SDV category tabs mobile overflow (tabs now flex-wrap, no horizontal scrolling needed)
- Added Guardian "Stop Analysis" button (AbortController-based cancellation during AI analysis)
- Added Guardian "Thinking Indicator" with cycling status messages + elapsed timer
- Fixed Guardian page rubber-banding (overscroll-behavior: contain, proper height calc)
- Disabled pinch-to-zoom for PWA/bookmark mode (viewport meta + gesture event prevention + touch-action CSS)
- Added overscroll protection to mobile header/footer (touch-action: none, overscroll-behavior: none)
- Added push notifications to beneficiary settings page (NotificationSettings component)
- Fixed mobile menu X button clipping on iPhone rounded corners (safe-area-aware positioning)
- **Google Places Autocomplete** on all address fields: BeneficiariesPage, OnboardingPage, ChecklistPage, SignupPage
- **Enhanced Signup Wizard** (5 steps): Name → About You (gender, DOB, marital status, dependents) → Address (Google autocomplete) → Role → Credentials
- **Auto-estate creation** on benefactor registration with encryption salt
- **Auto-beneficiary stubs**: Spouse stub if married/domestic partnership, adult + minor dependent stubs based on counts
- Beneficiary cards show "NEEDS INFO" badge for stubs with tap-to-complete prompt
- Editing a stub clears is_stub flag
- **Special eligibility checkboxes** on signup role step: Active Duty Military, Federal/State Agency Operator, First Responder, Hospice Patient
- **Auto-tier selection** in Settings: special status → auto-highlights matching tier (military/hospice), greyes out others; Age 18-25 → auto-selects New Adult (no verification)
- **Beneficiary signup requires benefactor email** to link to the correct estate
- **Minor beneficiaries** (under 18) see "No Subscription Required" instead of plan cards
- Backend computes eligible_tier from special_status + DOB on registration
- Subscription status endpoint returns special_status, eligible_tiers, is_minor
- **Veteran tier** added: $5.99/mo benefactor, $1.99/mo beneficiary, requires DD214 or VA benefits letter verification
- Moved all special eligibility checkboxes to own Step 5 (symmetrical 2x3 grid with icons)
- Signup is now 6 steps: Name → About You → Address → Role → Eligibility → Credentials (beneficiaries skip eligibility)
- Auto-sync of new plans from code to DB subscription_settings
- **Enterprise / B2B Partner tier**: Code-based verification (not document upload). Admin creates codes with partner name, discount %, max uses. Users enter code in Settings → auto-approved, applies free/discounted access.
- Admin B2B Code Management: Create, toggle active/inactive, delete, copy code, track usage
- Enterprise checkbox on signup eligibility step, greys out other tiers in Settings
- **Subscriptions monolith split**: `subscriptions.py` (2351 lines) → `subscriptions/` package with `plans.py` (460), `checkout.py` (980), `verification_and_lifecycle.py` (960)
- **PNG viewer fix**: Document cards now clickable for preview, View/Download buttons visible on mobile (not hover-only)
- Mobile app build pipeline verified ready (codemagic.yaml, capacitor config, Cordova bounce plugin)


## Backlog (Post v1.0 Approval)
- **P1: Apple Passkeys** — Add "Sign in with Passkey" via `@argo-navis-dev/capacitor-passkey-plugin`. Associated Domains already configured. Backend WebAuthn routes partially built. Requires plugin install, challenge/verify endpoints, frontend registration + login flow. Target: v1.1
- **P2: Will Creation Wizard** — TurboTax-style guided will creation. Major revenue driver.
- **P2: OCR Document Scanning** — Camera-to-vault with text extraction (Tesseract)
- **P3: Uber-style distributed task queue** — For scaled customer support teams
- **P3: ID.me military verification** — Required for DoD contracts
- ~~Fix native app download button~~ — COMPLETED (uses Filesystem + Share sheet on native)
- ~~Remove debug 5-tap overlay from header~~ — COMPLETED
- ~~**Eternal Echo (AI Digital Corpus)**~~ — CANCELLED
- **P1: Share Extension — full native setup** — iOS Share Extension target needs to be added in Xcode (plugin installed, web handler built, Info.plist configured). Also needs: macOS share sheet support, Android intent-filter for receiving shared files, Windows/PC drag-and-drop upload via web. Walk user through Xcode target creation on next Codemagic build.
- **P1: Operations Admin Page** — Separate admin portal for Chief of Staff. Everything except revenue analytics. Focused on platform operations: support tickets, verifications, transitions, user management, system health. Accessible via a new role or tab.
- ~~**P1: Revenue Analytics on Master Admin**~~ — COMPLETED: MRR, ARR, total revenue, MoM growth, ARPU, churn, LTV tiles now on admin dashboard.
- **Twilio SMS OTP** — Waiting on Twilio A2P 10DLC approval (external dependency on their side, not ours)

### Session Mar 5, 2026
- **Admin Tree View**: Added benefactor-beneficiary tree view to UsersTab. Backend `/admin/users` now returns `linked_beneficiaries` for each benefactor by joining estates and beneficiaries collections. Frontend Tree toggle groups users into Administrators, Benefactors & Their Beneficiaries, and Unlinked Beneficiaries sections. Benefactors can be expanded to show their linked beneficiaries with indentation and status badges.
- **New Adult (18-25) Signup Flow**: Refined signup for 18-25 year old benefactors — their beneficiaries are framed as "Parent / Guardian" (not dependents). Step text explains giving parents access to POA and Living Will. Purple info banner on Role step explains New Adult tier. Eligibility step is skipped entirely for New Adults (auto-qualify, no verification needed). In subscription settings, all plans except New Adult are greyed out.
- **Debug overlay removed**: Removed the 5-tap debug overlay from the mobile header (MobileNav.js). Production-ready.
- **Native app download fix**: Updated VaultPage download handler to detect native platform (Capacitor) and use Filesystem + Share plugins instead of blob URLs. On iOS/Android, downloads now write to cache then open the native share sheet for saving/sharing. Web/PWA continues using standard blob download. Added `@capacitor/share` dependency.
