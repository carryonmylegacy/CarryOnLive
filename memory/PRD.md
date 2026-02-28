# CarryOn — Product Requirements Document

## Original Problem Statement
CarryOn is a secure estate planning platform for American families. It helps users organize critical end-of-life documents, milestone messages, and digital asset credentials, encrypted and stored securely for beneficiaries to access when the time comes.

## Core Architecture
- **Frontend**: React (CRA) + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI (Python) + Motor (async MongoDB)
- **Database**: MongoDB Atlas (production) / local MongoDB (preview)
- **Storage**: AWS S3 (production) / local filesystem (preview)
- **AI**: xAI Grok (Estate Guardian AI / EGA)
- **Payments**: Stripe
- **Email**: Resend (OTP delivery)
- **Hosting**: Vercel (frontend), Railway (backend)
- **Mobile**: Capacitor (iOS/Android PWA)

## What's Been Implemented

### Session: Feb 28, 2026 (Current Fork)

**In-App PDF Viewer**:
- Integrated react-pdf v10.4.1 for native PDF rendering in a floating tile modal
- PDFViewerModal with zoom controls, page navigation, and download button

**Document Card Thumbnails**:
- DocThumbnail component renders first-page PDF preview and image previews on vault cards
- Lazy-loaded with loading state, error fallback to file-type icon

**Subscription UI Redesign**:
- Complete overhaul of SubscriptionManagement component
- Role-aware: benefactors see DEFAULT_PLANS, beneficiaries see BENEFICIARY_PLANS
- Billing toggle (Monthly/Quarterly/Annual) dynamically updates all pricing
- Subscribe buttons connect to Stripe checkout flow
- Family Plan request for beneficiaries (email notification to benefactor)

**Beneficiary Payment Lifecycle**:
- DOB auto-detection for turning 18 (subscription required) and turning 26 (age out of New Adult)
- 30-day grace period for hospice patient benefactor transition
- Admin endpoint to trigger benefactor transitions
- Daily background task for age-based event detection

**Mobile App Refinements**:
- OnboardingWizard moved above Estate Selector for immediate visibility on mobile
- Mobile header background changed to fully opaque (#0F1629 dark, #DBEAFE light)
- Removed backdrop-filter blur from header and bottom nav
- Added safe-area-inset-top padding so header extends behind device status bar
- Bottom nav also fully opaque

**`.gitignore` Fix**: Cleaned from 503 lines (100+ duplicated blocks) to 87 lines

### Previous Session Work
- OTP Email System with Resend
- Section Lock Security Hardening (session-based unlock)
- Voice Biometrics Overhaul (5x speed improvement)
- Dashboard Layout Fix
- GDPR Consent Settings
- Admin Settings (subscription hidden for admin)
- Compliance Audit Fixes (HIPAA, App Store)
- Codemagic CI/CD YAML fix

## Pending / Backlog
- P1: Codemagic build verification (USER VERIFICATION)
- P1: Beneficiary Hub Orbit Visualization (USER VERIFICATION)
- P1: Beneficiary Hub "You" Label (USER VERIFICATION)
- P1: Beneficiary Gentle Intro e2e test (USER VERIFICATION)
- P2: Animated logo (awaiting asset from user)
- P2: SMS OTP via Twilio (awaiting A2P 10DLC approval)
- P3: Mobile deployment
- P3: Redis-backed rate limiting
