# CarryOn — Product Requirements Document

## Original Problem Statement
CarryOn is a secure estate planning platform for American families. It helps users organize critical end-of-life documents, milestone messages, and digital asset credentials, encrypted and stored securely for beneficiaries to access when the time comes.

**Target Audience**: 350,000+ U.S. hospice patients, military families, and every American family.

## Core Architecture
- **Frontend**: React (CRA) + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI (Python) + Motor (async MongoDB)
- **Database**: MongoDB Atlas (production) / local MongoDB (preview)
- **Storage**: AWS S3 (production) / local filesystem (preview)
- **AI**: xAI Grok (Estate Guardian AI)
- **Payments**: Stripe
- **Email**: Resend
- **SMS**: Twilio
- **Hosting**: Vercel (frontend), Railway (backend)

## Security Architecture (SOC 2 Compliant)
- AES-256-GCM encryption with per-estate derived keys (PBKDF2-SHA256, 600K iterations)
- Zero-knowledge: encrypted content at rest, plaintext never stored
- AWS S3 with SSE-S3 as second encryption layer
- Immutable security audit trail
- Account lockout (5 failed attempts / 15-minute window)
- Password complexity (8+ chars, uppercase, lowercase, digit)
- OTP with 10-minute expiry using cryptographically secure generation
- Comprehensive security headers (CSP, HSTS with preload, X-Frame-Options DENY)
- Rate limiting on auth endpoints (10/min strict, 20/min moderate)
- Cache-Control no-store on all API responses
- Database TTL indexes for auto-cleanup of security records
- Estate ownership verification on all document endpoints
- Emergency access with multi-step verification + admin approval

## What's Been Implemented

### Admin Portal Refactoring (COMPLETE)
- AdminPage.js refactored from 1588 to 142 lines + 9 sub-components
- Real-time search across all admin tabs

### Zero-Knowledge Architecture (COMPLETE)
- AES-256-GCM encryption with per-estate derived keys
- AWS S3 cloud storage integration
- Lazy migration from legacy Fernet
- Security audit trail
- Death certificates now AES-256 encrypted

### Estate Guardian AI (COMPLETE)
- Grok-like persona with strict estate law guardrails
- US estate law expertise (all 50 states)
- PDF checklist export
- Legal disclaimer on every response

### Security Hardening Audit (COMPLETE - Feb 28, 2026)
- 16 security fixes implemented and verified
- See CHANGELOG.md for full list

### Feature 1: Onboarding Wizard (COMPLETE - Feb 28, 2026)
- 5-step guided setup: Create Estate, Add Beneficiary, Upload Document, Create Message, Review Readiness
- Auto-detects progress from actual data
- Dismissible card on dashboard
- Backend: /api/onboarding/progress, /api/onboarding/complete-step/{key}, /api/onboarding/dismiss
- Frontend: OnboardingWizard.js component integrated into DashboardPage

### Feature 2: Estate Readiness Notifications (COMPLETE - previously existed)
- Weekly digest with readiness score progress and "next best action"
- Already built into weekly_digest_scheduler with build_recommended_actions()

### Feature 3: Beneficiary Gentle Intro (COMPLETE - Feb 28, 2026)
- Two-step warm onboarding flow for invitation acceptance
- Step 1: Sensitive explanation of what CarryOn is and what being added means
- Step 2: Account creation with password strength indicators
- Privacy-first messaging throughout
- Frontend: AcceptInvitationPage.js completely rewritten

### Feature 4: Quick-Start Templates (COMPLETE - Feb 28, 2026)
- 4 scenario-based checklist templates:
  - Hospice Care (14 items)
  - Military Deployment (10 items)
  - New Parent (9 items)
  - Recently Married (9 items)
- Duplicate prevention (title matching)
- Backend: /api/templates/scenarios, /api/templates/apply
- Frontend: QuickStartTemplates.js integrated into ChecklistPage

### Feature 5: Emergency Access Protocol (COMPLETE - Feb 28, 2026)
- Beneficiaries can request emergency vault access when benefactor is incapacitated
- Multi-step form with reason, relationship, urgency, phone
- Admin review system: approve (with duration/level), deny, request more info
- Active access tracking with expiration
- Audit trail for all requests and reviews
- Backend: /api/emergency-access/* routes
- Frontend: EmergencyAccessPanel.js integrated into BeneficiaryHubPage

### Bug Fix: Dev Switcher Profile Selection (COMPLETE - Feb 28, 2026)
- Root cause: Public `/api/dev-switcher/config` endpoint didn't return passwords (by design), making benefactor/beneficiary accounts permanently disabled in the DEV panel
- Fix: Created new `/api/auth/dev-switch` endpoint that accepts only email + admin token, looks up stored password from `dev_config` server-side
- Frontend updated to use new endpoint for non-admin accounts, removed `isDisabled` logic
- Files: `backend/routes/auth.py`, `frontend/src/components/dev/DevSwitcher.js`

## Pending / Backlog
- P0: Build "Legacy Timeline" Prototype
- P1: Re-enable OTP Email System (Resend + domain verification)
- P1: Codemagic Mobile CI/CD Pipeline fix
- P2: Animated logo implementation
- P2: Beneficiary Hub "You" label verification
- P3: Mobile app deployment
- P3: Token revocation / blacklist mechanism
- P3: Redis-backed rate limiting for multi-worker deployments
