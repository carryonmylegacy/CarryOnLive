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
- Rate limiting on auth endpoints
- Emergency access with multi-step verification + admin approval

## What's Been Implemented

### Security Hardening Audit (COMPLETE)
- 16 security fixes implemented and verified

### Admin Portal (COMPLETE)
- AdminPage.js refactored from 1588 to 142 lines + 9 sub-components
- Real-time search across all admin tabs
- Dev Switcher with server-side credential lookup (dev-switch endpoint)

### Zero-Knowledge Architecture (COMPLETE)
- AES-256-GCM encryption with per-estate derived keys
- AWS S3 cloud storage integration
- Death certificates encrypted

### Estate Guardian AI (COMPLETE)
- Grok-like persona with strict estate law guardrails
- US estate law expertise (all 50 states)
- PDF checklist export

### Onboarding Wizard (COMPLETE)
- 5-step guided setup
- Backend: /api/onboarding/*

### Quick-Start Templates (COMPLETE)
- 4 scenario-based checklist templates

### Emergency Access Protocol (COMPLETE)
- Beneficiaries can request emergency vault access
- Admin review system

### Beneficiary Gentle Intro (COMPLETE)
- Two-step warm onboarding flow for invitation acceptance

### Bug Fixes (COMPLETE - Feb 28, 2026)
- **Dev Switcher**: Created `/api/auth/dev-switch` endpoint for server-side credential lookup
- **Beneficiary Paywall**: Beneficiaries now skip subscription paywall (they don't pay)
- **Post-Stripe Plan Refresh**: SettingsPage detects `session_id` after Stripe redirect, confirms payment, refreshes subscription
- **Military/Hospice Verification**: Plan changes to military/hospice now require verification upload before checkout
- **Emergent Badge**: Removed hardcoded "Made with Emergent" badge from index.html
- **Backend CI Lint**: Fixed all ruff check + format issues for green CI

### Signup Page Redesign (COMPLETE - Feb 28, 2026)
- Multi-step wizard with 4 sliding tiles (Name, About You, Role, Credentials)
- Split layout matching homepage (logo/tagline left, wizard right on desktop)
- American flag hero background with depth gradients
- Gold progress bar with step indicators
- Smooth slide-out-left / slide-in-right transitions between steps
- Fade transition from homepage to signup
- Fixed card height across all steps (no jumping)
- Fully responsive PWA support (compact mobile layout)

### Legacy Timeline (COMPLETE - Feb 28, 2026)
- Chronological timeline of all estate events (documents, messages, beneficiaries, checklist, activity)
- Summary stats bar (documents, beneficiaries, messages, completed)
- Category filter pills with counts
- Date-grouped events with scroll-reveal animations
- Clickable events navigate to relevant page (vault, messages, beneficiaries, checklist)
- Edit history tracking for messages (logged on each save)
- Auto-detects estate if none selected in localStorage
- Backend: GET /api/timeline/{estate_id}
- Frontend: /timeline route, sidebar + mobile nav
- Files: backend/routes/timeline.py, frontend/src/pages/LegacyTimelinePage.js

## Pending / Backlog
- P1: Re-enable OTP Email System (Resend + domain verification)
- P1: Codemagic Mobile CI/CD Pipeline fix
- P2: Animated logo (awaiting asset)
- P2: Beneficiary Hub "You" label verification
- P3: Mobile app deployment
- P3: Token revocation / blacklist mechanism
- P3: Redis-backed rate limiting for multi-worker deployments
