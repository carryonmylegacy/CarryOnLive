# CarryOn — Product Requirements Document

## Original Problem Statement
CarryOn is a secure estate planning platform for American families. It helps users organize critical end-of-life documents, milestone messages, and digital asset credentials, encrypted and stored securely for beneficiaries to access when the time comes.

**Target Audience**: 350,000+ U.S. hospice patients, military families, and every American family.

## Core Architecture
- **Frontend**: React (CRA) + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI (Python) + Motor (async MongoDB)
- **Database**: MongoDB Atlas (production) / local MongoDB (preview)
- **Storage**: AWS S3 (production) / local filesystem (preview)
- **AI**: xAI Grok (Estate Guardian AI / EGA)
- **Payments**: Stripe (setup intents for future charges)
- **Email**: Resend (OTP delivery, domain: carryontechnologies.com)
- **SMS**: Twilio (OTP delivery — awaiting A2P registration)
- **Hosting**: Vercel (frontend), Railway (backend)
- **Mobile**: Capacitor (iOS/Android PWA)

## Feature Acronyms
- **EGA** — Estate Guardian AI
- **IAC** — Immediate Action Checklist
- **MM** — Milestone Messages
- **DTS** — Designated Trustee Services
- **SDV** — Secure Document Vault
- **DAV** — Digital Access Vault

## What's Been Implemented

### Session: Feb 28, 2026 (Current Fork)

**OTP Email System (Resend) — Fully Operational:**
- Resend API key validated and sending emails successfully
- POST /api/auth/resend-otp — new endpoint for resending OTP codes
- "Resend Code" button on login and signup OTP modals with 30s cooldown
- Login endpoint returns email_sent status for feedback

**Section Lock Security Hardening:**
- SectionLockedOverlay completely hides content (no blur/preview) — shows lock screen
- All 7 lockable pages wrapped: SDV, MM, IAC, BM, DTS, EGA, DAV
- Backend document download enforces SDV section lock (403 when locked)

**Dashboard Layout Fix:**
- OnboardingWizard caches dismissed/complete state in localStorage — no more flash/bump

**Voice Enrollment Fix:**
- Added ffmpeg + libsndfile1 to backend Dockerfile

**Beneficiary Hub Orbit Visualization:**
- Removed overflow clipping, increased sizes, continuous animation

**Codemagic CI/CD Optimization:**
- Added caching, timeouts, GENERATE_SOURCEMAP=false

**Admin Settings Cleanup:**
- Subscription Management and Family Plan hidden for admin role

**GDPR Privacy & Data Rights Page:**
- Consent toggles: Marketing Emails, Analytics Tracking, Third-Party Data Sharing
- Essential Services toggle always on (checked + disabled)
- "Download My Data" — exports all user data as JSON (GDPR Article 15/20)
- "Data Retention Policy" — modal showing 9 data categories with legal basis
- "Request Account Deletion" — confirmation modal requiring email match (GDPR Article 17)
- All consent changes logged to consent_audit_log collection
- Deletion blocked if user has estates with active beneficiaries

## Pending / Backlog
- P1: Codemagic Mobile CI/CD — config optimized, needs build verification
- P1: Beneficiary Gentle Intro — code complete, needs e2e test with live invitation token
- P2: Animated logo (awaiting asset from user)
- P2: SMS OTP (awaiting Twilio A2P registration)
- P3: Mobile app deployment
- P3: Redis-backed rate limiting for multi-worker deployments

## Security Architecture
- AES-256-GCM encryption with per-estate derived keys
- Email OTP on every login with daily trust option
- Section-level triple lock with backend enforcement
- JWT 8-hour expiry, server-side blacklist
- Rate limiting on all auth endpoints
- ffmpeg in Docker for voice biometric processing

## Compliance Status
- **SOC 2**: Certification pending — all technical controls implemented
- **HIPAA**: Certification pending — PHI access logging, encryption, role-based access
- **GDPR**: Frontend consent management live — data export, deletion, retention policy
- **Apple App Store**: Privacy manifest, all usage descriptions present
