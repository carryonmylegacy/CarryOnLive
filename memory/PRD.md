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

## Security Architecture
- AES-256-GCM encryption with per-estate derived keys (PBKDF2-SHA256, 600K iterations)
- Zero-knowledge: encrypted content at rest, plaintext never stored
- Email OTP on every login (daily trust option, midnight ET reset)
- bcrypt password hashing (8+ chars, upper/lower/digit required)
- Account lockout (5 failures / 15 min window)
- JWT 8-hour expiry, server-side token blacklist on logout
- Rate limiting: 10/min strict (auth, resend-otp, deletion-request), 20/min moderate (register, data-export)
- Section-level triple lock with backend enforcement on both download AND preview
- ffmpeg in Docker for voice biometric processing
- 10 security headers (HSTS preload, CSP, COOP, CORP, etc.)
- Request body 50MB limit, file upload 25MB + content type whitelist

## Compliance Status

### SOC 2 (Certification Pending)
- Rate limiting on all sensitive endpoints (auth + compliance)
- Comprehensive audit logging (security_audit_log, activity_log)
- Token revocation system (individual + bulk)
- Security incident reporting endpoint
- Data retention policy (9 categories with legal basis)
- Session management with expiry

### HIPAA (Certification Pending)
- PHI access logging on document download, preview, and voice/video playback
- AES-256-GCM encryption at rest
- Role-based access control (benefactor, beneficiary, admin)
- Section-level lock enforcement on API layer
- Minimum necessary access principle

### GDPR (Certification Pending)
- Data export: user profile, estates, documents metadata, messages, beneficiaries, checklists, digital wallet, DTS tasks, activity logs, subscription, consent preferences, consent history
- Account deletion request with email confirmation
- Consent management with audit trail (marketing, analytics, third-party sharing)
- Frontend consent settings page
- Data retention policy (public-facing)

### Apple App Store
- PrivacyInfo.xcprivacy: NSPrivacyTracking=false
- Collected data types: email, name, phone, payment, user content, audio
- Accessed API types: UserDefaults (CA92.1), FileTimestamp (C617.1)
- NSMicrophoneUsageDescription present
- All marketing claims verified accurate

## What's Been Implemented

### Audit Session: Feb 28, 2026

**HIPAA Fixes:**
- Added PHI access logging to document preview endpoint
- Added section lock enforcement to document preview (was only on download)

**GDPR Fixes:**
- Expanded data export: now includes digital_wallet, dts_tasks, consent_preferences, consent_history
- Rate limiting added to data-export (20/min) and deletion-request (10/min)

**App Store Fixes:**
- Added NSPrivacyCollectedDataTypeAudioData to PrivacyInfo.xcprivacy
- Added NSPrivacyAccessedAPICategoryFileTimestamp (C617.1) to accessed API types

**Marketing Accuracy:**
- Fixed UploadCertificatePage: removed "certified" from Transition Verification Team reference
- Changed "never stored on public servers" to "stored securely" (accurate for S3)

**Deep Lint:**
- Backend: 0 errors (all routes, services, utils, tests)
- Frontend: 0 errors (all pages, components, contexts)
- Test files: Fixed 4 lint errors (E712 equality comparisons, F541 f-string)

## Pending / Backlog
- P1: Codemagic Mobile CI/CD — config optimized, needs build verification
- P1: Beneficiary Gentle Intro — needs e2e test with live invitation token
- P2: Animated logo (awaiting asset from user)
- P2: SMS OTP (awaiting Twilio A2P registration)
- P3: Mobile app deployment
- P3: Redis-backed rate limiting for multi-worker deployments
