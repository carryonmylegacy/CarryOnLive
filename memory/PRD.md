# CarryOn™ — Product Requirements Document

## Original Problem Statement
CarryOn™ is a secure estate planning platform for American families. It helps users organize critical end-of-life documents, milestone messages, and digital asset credentials, encrypted and stored securely for beneficiaries to access when the time comes.

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
- No-cache directives on all API responses
- Database TTL indexes for auto-cleanup of security records

## What's Been Implemented
### Phase 1: Admin Portal (COMPLETE)
- Refactored AdminPage.js from 1588 lines to 142-line shell + 9 components
- Real-time search across all admin tabs

### Phase 2: Zero-Knowledge Architecture (COMPLETE)
- AES-256-GCM encryption service with per-estate keys
- AWS S3 cloud storage integration
- Lazy migration from legacy Fernet to AES-256-GCM
- Security audit trail service

### Phase 3: Estate Guardian AI (COMPLETE)
- Grok-like conversational persona with strict guardrails
- US estate law expertise (all 50 states)
- PDF checklist export
- Legal disclaimer on every response

### Phase 4: Security Hardening Audit (COMPLETE - Feb 28, 2026)
- Account lockout mechanism (5 failed attempts / 15 min)
- Password complexity enforcement (8+ chars, upper/lower/digit)
- OTP time expiry (10 minutes)
- Content-Security-Policy header
- HSTS with preload directive
- Cache-Control no-store on all API responses
- Estate ownership verification on all document endpoints
- Zero-knowledge fix: messages no longer store plaintext content
- Death certificates encrypted with AES-256-GCM
- Cryptographically secure OTP/backup code generation (secrets module)
- Database indexes for security collections
- OTP logging sanitized (no plaintext in logs)
- CORS restricted from wildcard to specific origins

## Pending / Backlog
- P1: Re-enable OTP Email System (Resend + domain verification)
- P1: Codemagic Mobile CI/CD Pipeline fix
- P2: Animated logo implementation
- P2: Beneficiary Hub "You" label verification
- P3: Mobile app deployment
