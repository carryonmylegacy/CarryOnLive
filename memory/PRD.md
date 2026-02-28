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

**Military/Hospice Verification Flow**:
- Verification upload modal with doc types: Military ID, Active Duty Orders, First Responder Badge (military); Hospice Enrollment Documentation (hospice)
- Admin VerificationsTab with toggle approval switch + "Notify Benefactor" button
- POST /api/admin/verifications/{id}/notify sends auto-message to benefactor's Customer Service portal + push notification
- After admin approval, benefactor can subscribe without re-verification (isVerifiedFor check)
- "Verification Pending" status badge shown on plan cards while under review

**Subscription UI Redesign**:
- Role-aware: benefactors see DEFAULT_PLANS, beneficiaries see BENEFICIARY_PLANS
- Billing toggle (Monthly/Quarterly/Annual) dynamically updates all pricing
- Subscribe buttons connect to Stripe checkout
- Family Plan request for beneficiaries

**Beneficiary Payment Lifecycle**:
- DOB auto-detection for turning 18/26
- 30-day grace period for hospice transitions
- Daily background task for age events

**In-App PDF Viewer + Document Thumbnails**:
- react-pdf v10.4.1 floating tile modal with zoom/navigation
- DocThumbnail on vault cards shows PDF first-page and image previews

**Mobile App Refinements**:
- OnboardingWizard moved above fold for mobile visibility
- Fully opaque mobile header/bottom nav with safe-area-inset-top padding
- .gitignore cleaned (503 → 87 lines)

## Pending / Backlog
- P1: Codemagic build verification (USER VERIFICATION)
- P1: Beneficiary Hub Orbit Visualization (USER VERIFICATION)
- P1: Beneficiary Gentle Intro e2e test (USER VERIFICATION)
- P2: Animated logo (awaiting asset)
- P2: SMS OTP via Twilio (awaiting A2P 10DLC)
- P3: Mobile deployment
- P3: Redis-backed rate limiting
