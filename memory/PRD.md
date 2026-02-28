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

**OTP Email System**: Fully operational with Resend. Resend-otp endpoint added with 30s cooldown.

**Section Lock Security Hardening:**
- SectionLockedOverlay completely hides content when locked (all 7 pages)
- Backend session-based unlock tracking (section_unlock_sessions collection, 8hr TTL)
- Document download AND preview enforce section lock + session unlock
- Security Settings require account password to disable locks (toggle off / remove)
- POST /api/auth/verify-password endpoint for identity confirmation

**Voice Unlock Modal:**
- Stop recording button (tap circle to stop)
- Auto-verify after recording (no manual button click needed)
- Clean centered modal with progress dots for multi-step unlock

**Dashboard Layout**: OnboardingWizard moved below Estate Readiness Score to prevent flash/bump

**SDV Document View**: Eye button opens in-app preview for PDFs/images, downloads for other types. Edit modal anchored with !top-[5vh].

**Voice Biometrics**: Replaced pyin with yin (5x speedup). Runs in thread pool (asyncio.to_thread).

**Codemagic CI/CD**: Optimized config with caching and timeouts.

**GDPR**: Full consent settings page with data export, retention policy, deletion requests.

**Admin Settings**: Subscription/Family Plan hidden for admin role.

**Audit Fixes**: HIPAA PHI logging on preview, App Store audio data type, marketing claims corrected.

## Pending / Backlog
- P1: Codemagic build verification on Codemagic
- P1: Beneficiary Gentle Intro e2e test with live invitation
- P2: Animated logo (awaiting asset)
- P2: SMS OTP (awaiting Twilio A2P)
- P3: Mobile deployment
- P3: Redis-backed rate limiting
