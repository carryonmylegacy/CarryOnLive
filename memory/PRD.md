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
