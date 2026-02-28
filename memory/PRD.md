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
- Integrated `react-pdf` v10.4.1 for native PDF rendering in a floating tile modal
- PDFViewerModal component with zoom controls, page navigation, and download button
- Eye icon on document tiles opens viewer for PDFs and images
- Non-previewable files gracefully fallback to download

**Document Card Thumbnails**:
- New DocThumbnail component renders first-page PDF preview and image previews on vault cards
- Lazy-loaded with loading state, error fallback to file-type icon
- Uses react-pdf Page component for PDF thumbnails

**Subscription UI Redesign**:
- Complete overhaul of SubscriptionManagement component
- Role-aware: benefactors see DEFAULT_PLANS, beneficiaries see BENEFICIARY_PLANS
- Billing toggle (Monthly/Quarterly/Annual) dynamically updates all pricing
- Premium-styled plan cards with proper hierarchy, badges, and CTAs
- Subscribe buttons connect to Stripe checkout flow
- Beta Access banner with appropriate messaging

**Beneficiary Payment Lifecycle**:
- Family Plan request: beneficiaries can request to join a benefactor's family plan
- POST /api/subscriptions/family-plan-request sends email notification to benefactor
- GET /api/subscriptions/beneficiary/lifecycle-status returns age events and grace period info
- DOB auto-detection for turning 18 (subscription required) and turning 26 (age out of New Adult)
- 30-day grace period for hospice patient benefactor transition
- POST /api/admin/beneficiary/trigger-transition creates grace periods and sends emails
- Daily background task (check_dob_subscription_events) auto-detects age-based events

**Beneficiary Plans Updated**:
- Added quarterly_price and annual_price to all BENEFICIARY_PLANS
- Reordered: Premium ($2.99) → Standard ($3.99) → Base ($4.99) → Hospice Transition ($4.99)

**`.gitignore` Fix**:
- Cleaned up from 503 lines (with ~100 duplicate environment blocks) to 87 lines

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
