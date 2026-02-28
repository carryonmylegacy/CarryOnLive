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
- **Email**: Resend (pending domain verification)
- **SMS**: Twilio (OTP delivery)
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
- Bulk session revocation capability
- Rate limiting: 10/min strict (auth), 20/min moderate (register)
- 10 security headers (HSTS preload, CSP with form-action, COOP, CORP, etc.)
- Request body 50MB limit, file upload 25MB + content type whitelist
- Open redirect prevention on Stripe URLs
- X-Forwarded-For proxy-aware IP detection
- JWT_SECRET fails fast if missing (no fallback)

## Compliance Status
- **SOC 2**: Certification pending — all technical controls implemented
- **HIPAA**: Certification pending — PHI access logging, encryption, role-based access
- **GDPR**: Certification pending — data export, deletion requests, consent management
- **Apple App Store**: Privacy manifest, all usage descriptions present

## What's Been Implemented

### Session: Feb 28, 2026

**Bug Fixes:**
- Dev Switcher profile selection (server-side credential lookup)
- Beneficiary bypasses subscription paywall
- Post-Stripe plan refresh on Settings page
- Military/Hospice verification gate before checkout
- Removed "Made with Emergent" badge
- Digital Wallet blank screen (SelectItem empty value crash)
- Document unlock no longer auto-downloads (refetches list instead)
- Backend CI lint fully green

**Signup Page Redesign:**
- 4-step sliding wizard (Name → About You → Role → Credentials)
- Split layout with American flag hero
- Smooth fade/slide transitions, fixed card height, PWA responsive

**Legacy Timeline:**
- GET /api/timeline/{estate_id} — chronological estate events
- Clickable events navigate to relevant page
- Edit history tracking: messages, documents, checklists, beneficiaries, digital_wallet

**Security Hardening:**
- Token blacklist/revocation system (services/token_blacklist.py)
- Server-side logout (POST /api/auth/logout)
- Removed hardcoded admin credentials from DevSwitcher
- JWT expiry reduced to 8 hours
- JWT_SECRET fail-fast enforcement
- Request body size limiting (50MB)
- File upload type whitelist + 25MB limit
- Open redirect prevention
- X-XSS-Protection set to 0 (modern best practice)
- COOP + CORP headers added
- Error message sanitization (no str(e) leaks)

**OTP Re-enablement:**
- Email OTP on every login
- Daily trust option (midnight ET reset, per IP)
- Proxy-aware IP detection

**Compliance Infrastructure (routes/compliance.py):**
- GDPR: Data export, deletion requests, consent management, consent audit trail
- HIPAA: PHI access logging on document downloads
- SOC 2: Security incident logging, data retention policy (9 categories)
- DB indexes for all compliance collections

**Subscription Billing Fix:**
- Billing cycle changes now go through Stripe checkout (full period upfront)
- Plan changes charge full period (quarterly ×3, annual ×12)

**UI/UX:**
- All 10+ modals anchored (no jumping)
- Voice recording: stop button added, no auto-timeout
- Section re-lock button after unlock
- Phone fields: (123) 456-7890 format, +1 prepended on submit
- Feature acronyms: EGA, IAC, MM, DTS, SDV, DAV across platform
- DTS custom release timing option
- DTS 30-second polling for admin quotes
- DTS payment form: billing ZIP added, clearer card field labels
- Light/dark mode: ~100+ fixes for invisible borders/backgrounds
- Subscription tiles: theme-aware colors
- Estate Readiness Score: reduced desktop size
- Digital Wallet Vault renamed to Digital Access Vault (DAV)
- Homepage animation GPU-optimized (translate3d, will-change, preload)

**Apple App Store:**
- NSMicrophoneUsageDescription added
- PrivacyInfo.xcprivacy privacy manifest created

**Voice Messages:**
- Voice-only recording option added to MM (Written/Voice/Video)
- Backend: voice storage, encryption, playback endpoint
- Frontend: record/stop UI, voice playback

**Marketing Accuracy:**
- Removed all "air-gapped" and "zero internet" claims
- Updated to "written, voice, or video" messages
- SOC 2/HIPAA/GDPR: "certification pending"
- All security tiles reflect actual capabilities

## Pending / Backlog
- P1: Re-enable OTP email delivery (Resend + domain verification)
- P1: Codemagic Mobile CI/CD Pipeline fix
- P2: Animated logo (awaiting asset)
- P2: Frontend compliance settings page (GDPR consent UI for end users)
- P3: Mobile app deployment
- P3: Redis-backed rate limiting for multi-worker deployments
