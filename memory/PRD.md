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


### Session Mar 6, 2026 — Security Hardening & Apple Readiness Audit
- **Comprehensive End-to-End Lint**: Both frontend (ESLint) and backend (ruff) pass with zero errors across all source and test files.
- **Security Hardening**:
  - Tightened auth endpoint rate limiting from 200 req/min (dev) to 10 req/min (production-ready) for login, verify-otp, resend-otp, verify-password, and deletion-request.
  - Added check-email and check-benefactor-email endpoints to moderate rate limiting tier (20 req/min) to prevent user enumeration abuse.
  - Removed insecure encryption key fallback in config.py — server now fails fast if ENCRYPTION_KEY is missing, matching JWT_SECRET behavior.
  - Made OTP comparison timing-safe using `hmac.compare_digest()` to prevent timing side-channel attacks.
  - Gated public dev-switcher config endpoint behind environment check — returns `{enabled: false}` in production.
- **Monolith Organization**:
  - Extracted `DateMaskInput` component from SignupPage.js (1186→1140 lines) into standalone `/app/frontend/src/components/DateMaskInput.js` for reusability and maintainability.
- **Verification**: All 19 backend security tests passed (iteration 50). Frontend signup flow, DateMaskInput, and OTP modal all verified functional.
- **Security Scan Endpoint**: Built admin-only `GET /api/admin/security-scan` that runs 41 automated checks across 11 categories (Authentication, Encryption, Rate Limiting, Security Headers, CORS, File Upload, Data Protection, Database, External Services, Compliance, Production Readiness). Returns letter grade (A/B/C/F), per-check pass/warn/fail with details. Produces SOC 2 audit evidence.

### Session Mar 6, 2026 — Guided Activation Frosted Glass Overlay + IAC Fixes
- **Frosted Glass Overlay**: Replaced the old full-screen dark guided activation with a frosted glass (`backdrop-filter: blur(16px)`) overlay on top of the visible dashboard. Shows a centered bubble with step icon, "Step X of 5" label, title, description, and gold "Let's Go" CTA button. Includes X close button (upper-right) and "Skip this step for now" pill at the bottom.
- **5-Step Onboarding**: Removed `create_estate` from ONBOARDING_STEPS (auto-completed at registration). Now exactly 5 steps: create_message → upload_document → designate_primary → customize_checklist → review_readiness.
- **Default IAC Items Fixed**: Exactly 5 items with `category=immediate`, all beneficiary-focused for post-transition guidance. Demo account cleaned from 30 items to correct 5.
- **ReturnPopup on BeneficiariesPage**: Congratulatory modal appears after designating primary beneficiary.
- **ReturnPopup on GuardianPage**: Congratulatory modal appears after first EGA analysis.
- **ReturnPopup messages updated**: Exact user-specified wording for primary ("Congratulations — you made a huge step!"), checklist ("Congratulations — a huge next step!"), guardian ("Congratulations! You have completed the initial creation of your estate plan...").
- **Celebration Overlay**: Final celebration after all 5 steps complete also uses frosted glass with X close button.
- **Personalized Step 1**: "Leave a Message for [beneficiary names]" using names from onboarding.
- **Dev Switcher fixed**: Reverted production gate, updated auth to accept any configured account token (not just admin).

## Backlog (Post v1.0 Approval)
- **P1: Apple Passkeys** — Add "Sign in with Passkey" via `@argo-navis-dev/capacitor-passkey-plugin`. Associated Domains already configured. Backend WebAuthn routes partially built. Requires plugin install, challenge/verify endpoints, frontend registration + login flow. Target: v1.1
- **P2: Will Creation Wizard** — TurboTax-style guided will creation. Major revenue driver.
- **P2: OCR Document Scanning** — Camera-to-vault with text extraction (Tesseract)
- **P3: Uber-style distributed task queue** — For scaled customer support teams
- ~~Fix native app download button~~ — COMPLETED (uses Filesystem + Share sheet on native)
- ~~Remove debug 5-tap overlay from header~~ — COMPLETED
- ~~**Eternal Echo (AI Digital Corpus)**~~ — CANCELLED
- ~~**Will Creation Wizard**~~ — CANCELLED
- ~~**ID.me military verification**~~ — CANCELLED
- **P1: Share Extension — full native setup** — iOS Share Extension target needs to be added in Xcode (plugin installed, web handler built, Info.plist configured). Also needs: macOS share sheet support, Android intent-filter for receiving shared files, Windows/PC drag-and-drop upload via web. Walk user through Xcode target creation on next Codemagic build.
- **P1: Operations Admin Page** — Separate admin portal for Chief of Staff. Everything except revenue analytics. Focused on platform operations: support tickets, verifications, transitions, user management, system health. Accessible via a new role or tab.
- ~~**P1: Revenue Analytics on Master Admin**~~ — COMPLETED: MRR, ARR, total revenue, MoM growth, ARPU, churn, LTV tiles now on admin dashboard.
- **Twilio SMS OTP** — Waiting on Twilio A2P 10DLC approval (external dependency on their side, not ours)

### Session Mar 5, 2026
- **Admin Tree View**: Added benefactor-beneficiary tree view to UsersTab. Backend `/admin/users` now returns `linked_beneficiaries` for each benefactor by joining estates and beneficiaries collections. Frontend Tree toggle groups users into Administrators, Benefactors & Their Beneficiaries, and Unlinked Beneficiaries sections. Benefactors can be expanded to show their linked beneficiaries with indentation and status badges.
- **New Adult (18-25) Signup Flow**: Refined signup for 18-25 year old benefactors — their beneficiaries are framed as "Parent / Guardian" (not dependents). Step text explains giving parents access to POA and Living Will. Purple info banner on Role step explains New Adult tier. Eligibility step is skipped entirely for New Adults (auto-qualify, no verification needed). In subscription settings, all plans except New Adult are greyed out.
- **Debug overlay removed**: Removed the 5-tap debug overlay from the mobile header (MobileNav.js). Production-ready.
- **Native app download fix**: Updated VaultPage download handler to detect native platform (Capacitor) and use Filesystem + Share plugins instead of blob URLs. On iOS/Android, downloads now write to cache then open the native share sheet for saving/sharing. Web/PWA continues using standard blob download. Added `@capacitor/share` dependency.
- **CI/CD Build Fixes**: Fixed `@/` import aliases (replaced with relative paths across 53 files), downgraded eslint-plugin-react-hooks to v4.6.2 (compatible with react-scripts 5), removed conflicting ESLint 9 packages (@eslint/js, standalone plugins), added eslintConfig extending react-app to package.json, fixed multiple code errors (missing braces in ChecklistPage.js, undefined `showPw` in LoginPage.js, bare `confirm()` calls in 4 files, import ordering in App.js and VaultPage.js), ran `ruff format` on backend. Both `Frontend Build` and `Backend Lint` CI jobs now pass.
- **Signup UX Fixes (User Feedback)**:
  - Added clarifier text on marital step: "Your spouse will be added as a beneficiary — do not count them as a dependent" + bottom note "Only children, elderly parents, or other financially supported individuals"
  - Made form step container scrollable (overflow-y-auto) so "Same address" checkbox is visible on small screens
  - Added middle name field to beneficiary enrollment (frontend + backend)
  - Added optional email field for minor dependents
  - Added red asterisks (`<span className="text-red-400">*</span>`) on all mandatory fields throughout signup (First Name, Last Name, Email, Password, Confirm, Benefactor Email, Street Address, Marital Status, Beneficiary First Name, Beneficiary Email)
  - Fixed "Something went wrong" on IAC page (missing closing brace on `stopAISuggest` function in ChecklistPage.js caused dependent variables to be scoped incorrectly)

### Session Mar 5, 2026 (continued)
- **Primary Beneficiary Designation Feature (P0)**:
  - **Backend**: Added `is_primary` field to Beneficiary model. Created `PUT /api/beneficiaries/{id}/set-primary` and `GET /api/beneficiaries/{estate_id}/primary` endpoints. Only one primary per estate (clears existing before setting new). Onboarding progress tracks `designate_primary` completion by checking live data.
  - **Frontend**: BeneficiariesPage now shows "Designate as Primary" button on each non-stub beneficiary card. Shows green "PRIMARY" badge with Shield icon on the designated beneficiary. Legal disclaimer modal with 4 bullet points about trustee responsibilities before confirming designation.
  - **Guided Activation Flow**: `designate_primary` is step 3 of 5 in the Getting Started flow (message → document → designate_primary → checklist → guardian). GuidedActivation component has a return popup variant for the primary step.

- **Post-Transition Beneficiary Access Requests**:
  - **Backend**: `POST /api/beneficiaries/request-access` creates a pending access request. If estate is pre-transition, request goes to the benefactor; if post-transition, it goes to the primary beneficiary (trustee). `GET /api/beneficiaries/access-requests/{estate_id}` lists pending requests. `PUT /api/beneficiaries/access-requests/{request_id}` allows approving/denying requests with automatic beneficiary creation and 30-day grace period on approval.
  - **Frontend**: BeneficiariesPage shows "Pending Access Requests" section when requests exist, with approve/deny buttons. Push notifications sent to approvers and requesters.

- **Paired Pricing (Post-Transition)**:
  - **Backend**: Added `paired_price` field to all DEFAULT_PLANS (Premium: $4.99, Standard: $5.99, Base: $6.99, New Adult: $3.99, Military: $3.99, Hospice: $6.99, Veteran: $3.99, Enterprise: $0). `GET /api/subscriptions/status` now returns `paired_price` when estate is transitioned. `PUT /api/admin/plans/{plan_id}/paired-price` allows admin to update paired prices. Plan sync logic updated to merge new fields from code into stored DB plans.
  - **Frontend**: Admin SubscriptionsTab now has a "Paired Pricing (Post-Transition)" section showing each benefactor tier's paired price with inline editing, matching the existing pricing UI pattern.
