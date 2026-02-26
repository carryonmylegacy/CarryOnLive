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
- Document Vault (AES-256 encrypted), Milestone Messages
- Beneficiary Management with demographics
- Estate Guardian AI (now powered by Grok/xAI)
- Immediate Action Checklist, DTS with Stripe
- Two-Level Section Security (Password + Voice Passphrase)
- Estate Readiness Score, Edit/Delete functionality
- Customer Support Chat, Push Notifications (PWA)

### Beneficiary Portal
- Estate Hub with generational orbit visualization
- Pre/Post-Transition views, Death Certificate Upload
- Sealed Vault, Messages, Checklist access

### Deployment Ready (Feb 2026)
- Backend + Frontend Dockerfiles
- docker-compose.yml, render.yaml (one-click Render deploy)
- nginx.conf for production frontend serving
- Production build script (strips Emergent-specific scripts)
- Health check endpoint (/api/health)
- VAPID key inline env var support
- **DEPLOY_GUIDE.md** — Plain English guide for non-developers
- **DEPLOYMENT.md** — Technical deployment reference

### AI Migration (Feb 2026)
- Switched Estate Guardian AI from OpenAI GPT-5.2 (via Emergent) to **xAI Grok**
- Uses OpenAI-compatible SDK with xAI base URL
- Voice passphrase (Whisper) still uses Emergent LLM Key

## 3rd Party Integrations
- **xAI Grok** (Estate Guardian AI) — requires XAI_API_KEY
- **OpenAI Whisper** (voice passphrase) — via Emergent LLM Key
- **Resend** (email OTP/invitations)
- **Twilio** (SMS OTP)
- **Stripe** (Setup Intents for DTS payments)

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

## Known Configuration Notes
- **Resend Email**: API key domain must match SENDER_EMAIL domain
- **SMS OTP**: Requires Twilio A2P 10DLC registration
- **ENCRYPTION_KEY**: Must be set in production
- **XAI_API_KEY**: Required for Estate Guardian AI
