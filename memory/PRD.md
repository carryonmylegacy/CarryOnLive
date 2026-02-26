# CarryOn™ - Estate Planning & Legacy Management Platform

## Original Problem Statement
Build a full-stack web app called CarryOn™ — a secure estate planning and legacy management platform with three distinct portals: Benefactor, Beneficiary, and Admin.

## What's Been Implemented (Complete)

### Authentication
- Email/Password login with 6-digit OTP 2FA (email + SMS)
- JWT tokens with 24-hour expiration
- Role-based access (benefactor, beneficiary, admin)

### Admin Portal
- User Management, TVT, DTS Management
- Customer Support Team messaging portal
- Dev Switcher Configuration

### Benefactor Portal
- Secure Document Vault (SDV) — AES-256 encrypted
- Milestone Messages (MM) — text/video with editable triggers
- Beneficiary Management (BM) — enhanced demographics
- Estate Guardian AI (EGA) — now powered by Grok/xAI
- Immediate Action Checklist (IAC)
- Designated Trustee Services (DTS) — with Stripe
- Estate Readiness Score
- Customer Support Chat, Push Notifications (PWA)

### Beneficiary Portal
- Estate Hub with generational orbit visualization
- Pre/Post-Transition views, Death Certificate Upload
- Sealed Vault, Messages, Checklist access

### Triple Lock Section Security (NEW - Feb 2026)
Three independently toggleable security layers per section, configurable from Settings:
- **Layer 1: Password** — section-specific password
- **Layer 2: Voice Biometric** — MFCC-based voiceprint verification (both words + voice identity)
- **Layer 3: Security Question** — preset list OR custom question
Three lock behavior modes per section:
- Auto-lock on page leave
- Auto-lock on logout
- Manual lock only (on command)
Protected sections: SDV, MM, BM, IAC, DTS, EGA
Backend: MongoDB-backed security settings, voice enrollment with ffmpeg/librosa, bcrypt-hashed credentials
Frontend: SecuritySettings component in Settings page, SectionLockBanner on all protected pages, UnlockModal with multi-step verification

### Deployment Ready (Feb 2026)
- Backend + Frontend Dockerfiles, docker-compose.yml, render.yaml
- DEPLOY_GUIDE.md (plain English for non-developers)
- Health check endpoint, VAPID inline env var support, production build script

### AI Migration (Feb 2026)
- Estate Guardian AI switched from OpenAI GPT-5.2 to xAI Grok
- Voice passphrase (Whisper) still uses Emergent LLM Key

## 3rd Party Integrations
- **xAI Grok** (Estate Guardian AI) — requires XAI_API_KEY
- **OpenAI Whisper** (voice STT) — via Emergent LLM Key
- **Resend** (email), **Twilio** (SMS), **Stripe** (payments)

## Test Accounts
- **Admin**: `founder@carryon.us` / `CarryOntheWisdom!`

## Upcoming Tasks (P1)
1. Multi-estate Support for benefactors
2. Backend Refactoring (server.py → modular structure)

## Future/Backlog (P2)
1. Full Payment/Subscription Gateway (Stripe)
2. Digital Asset Management
3. PDF Export
4. Frontend component decomposition
5. Frontend lint warnings cleanup
