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

## Completed Features (All Sessions)

### Session Feb 28 – Mar 2, 2026
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

### Session Mar 5, 2026
- Admin Tree View: benefactor-beneficiary tree with linked_beneficiaries
- New Adult (18-25) Signup Flow with parent/guardian framing
- Debug overlay removed from mobile header
- Native app download fix (Filesystem + Share plugins)
- CI/CD Build Fixes (import aliases, ESLint, ruff format)
- Signup UX Fixes (clarifier text, scrollable form, middle name, red asterisks)
- Primary Beneficiary Designation Feature (backend + frontend + guided flow)
- Post-Transition Beneficiary Access Requests
- Paired Pricing (Post-Transition)
- Google Places Autocomplete on all address fields
- Enhanced Signup Wizard (6 steps)
- Auto-estate creation on benefactor registration
- Auto-beneficiary stubs
- Special eligibility checkboxes
- Enterprise / B2B Partner tier with code verification
- Subscriptions monolith split
- PNG viewer fix

### Session Mar 6, 2026 — Security Hardening & Apple Readiness Audit
- Comprehensive End-to-End Lint (both frontend ESLint and backend ruff pass)
- Security Hardening (rate limiting, timing-safe OTP, encryption key failfast)
- Monolith Organization (DateMaskInput extraction)
- Security Scan Endpoint (GET /api/admin/security-scan, 41 automated checks)
- Dev Switcher regression fixes (2 separate issues resolved)
- CI/CD pipeline fix (ruff format)

### Session Mar 6, 2026 — Guided Activation Frosted Glass Overlay + IAC Fixes
- Frosted Glass Overlay (backdrop-filter: blur(16px)) on dashboard
- 5-Step Onboarding (create_message → upload_document → designate_primary → customize_checklist → review_readiness)
- Default IAC Items Fixed (5 items, beneficiary-focused)
- ReturnPopup on BeneficiariesPage and GuardianPage
- Celebration Overlay with frosted glass
- Personalized Step 1 with beneficiary names
- Dev Switcher production fix

### Session Mar 6, 2026 — P0 Verification (Current)
- **VERIFIED**: Frosted glass guided flow fully tested and working
  - Overlay renders correctly with step counter, icon, title, description
  - Skip button dismisses overlay
  - Close X button dismisses overlay
  - "Let's Go" button navigates to correct page
  - sessionStorage persistence prevents re-showing after dismissal
  - Backend /api/onboarding/progress returns correct step data
  - 100% pass rate on both backend and frontend tests

## Pending / Backlog
- P0: Mobile App rubber-banding/blank screen (Codemagic build validation pending)
- P1: In-App Viewer for PNG Images (triggers download instead of viewer)
- P1: VAPID keys on Railway for push notifications
- P1: Codemagic build for native Face ID testing
- P1: Apple Passkeys ("Sign in with Passkey")
- P1: Share Extension — full native setup (iOS Share Extension target in Xcode)
- P1: Operations Admin Page for Chief of Staff (everything except revenue analytics)
- P2: Animated logo (awaiting asset)
- P2: SMS OTP via Twilio (awaiting A2P 10DLC)
- P2: ISO 27001 full compliance
- P2: Beneficiary Hub & Gentle Intro Verification (user testing pending)
- P3: Redis-backed rate limiting

## Backlog (Post v1.0 Approval)
- **P1: Apple Passkeys** — Add "Sign in with Passkey" via `@argo-navis-dev/capacitor-passkey-plugin`
- **P1: Share Extension** — iOS Share Extension target in Xcode
- **P1: Operations Admin Page** — Separate admin portal for Chief of Staff
- **P2: Will Creation Wizard** — TurboTax-style guided will creation
- **P2: OCR Document Scanning** — Camera-to-vault with text extraction
- **Twilio SMS OTP** — Waiting on A2P 10DLC approval

## Test Credentials
- **Admin**: info@carryon.us / Demo1234!
- **Benefactor Test**: fulltest@test.com / Password.123
- **Benefactor Demo**: demo@carryon.us / Demo1234!
