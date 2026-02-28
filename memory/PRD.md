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
- Rate limiting: 10/min strict (auth + resend-otp), 20/min moderate (register)
- Section-level triple lock (password + voice + security question) with backend enforcement
- Document downloads blocked when SDV section lock is active
- All locked sections completely hide content until verified (no blur, no preview)
- ffmpeg required in Docker image for voice biometric processing

## What's Been Implemented

### Session: Feb 28, 2026 (Current Fork)

**OTP Email System (Resend) — Fully Operational:**
- Resend API key validated and sending emails successfully
- POST /api/auth/resend-otp — new endpoint for resending OTP codes
- "Resend Code" button added to login and signup OTP modals with 30s cooldown
- Rate limiting applied to resend-otp endpoint (10/min strict)
- Login endpoint now returns email_sent status for better error feedback

**Section Lock Security Hardening:**
- SectionLockedOverlay now completely hides content (no blur/preview) — shows lock screen
- All 7 lockable pages wrapped with SectionLockedOverlay: SDV, MM, IAC, BM, DTS, EGA, DAV
- Backend: Document download endpoint now enforces SDV section lock (403 when locked)
- Backend query fixed to check actual DB fields (password_enabled/voice_enabled/security_question_enabled) instead of computed is_active

**Dashboard Layout Fix:**
- OnboardingWizard now caches dismissed/complete state in localStorage
- Prevents layout shift ("flash and bump") when navigating to dashboard

**Voice Enrollment Fix:**
- Root cause: ffmpeg missing from Docker image and preview environment
- Added ffmpeg + libsndfile1 to backend Dockerfile for production builds

**Beneficiary Hub Orbit Visualization:**
- Removed overflow:hidden clipping — outer rings fully visible
- Increased all sizes (center 80px, orbit balls 38px, radii increased)
- Animation now orbits continuously (never stops/decays to zero)

**Codemagic CI/CD Optimization:**
- Added caching for node_modules, CocoaPods, and Gradle
- Added explicit timeouts to prevent indefinite hangs
- Added GENERATE_SOURCEMAP=false for faster builds

## Pending / Backlog
- P1: Codemagic Mobile CI/CD — config optimized, needs build verification on Codemagic
- P1: Beneficiary Hub "You" Label — code fix confirmed, awaiting user visual verification (DONE)
- P1: Beneficiary Gentle Intro — code complete, needs e2e test with live invitation token
- P2: Animated logo (awaiting asset from user)
- P2: SMS OTP (awaiting Twilio A2P registration)
- P2: Frontend compliance settings page (GDPR consent UI for end users)
- P3: Mobile app deployment
- P3: Redis-backed rate limiting for multi-worker deployments

## Compliance Status
- **SOC 2**: Certification pending — all technical controls implemented
- **HIPAA**: Certification pending — PHI access logging, encryption, role-based access
- **GDPR**: Certification pending — data export, deletion requests, consent management
- **Apple App Store**: Privacy manifest, all usage descriptions present

## Key API Endpoints
- POST /api/auth/resend-otp (NEW) — Resend OTP with anti-enumeration protection
- GET /api/documents/{id}/download — Now enforces SDV section lock (403 when locked)
- GET /api/security/settings — Returns section lock state for all sections
- POST /api/security/verify/{section_id} — Multi-step unlock verification
