# CarryOn™ - Estate Planning & Legacy Management Platform

## Original Problem Statement
Build a full-stack web app called CarryOn™ — a secure estate planning and legacy management platform with three distinct portals: Benefactor, Beneficiary, and Admin.

## What's Been Implemented (Complete)

### Authentication
- Email/Password login with 6-digit OTP 2FA
- SMS OTP option (requires Twilio setup)
- JWT tokens with 24-hour expiration
- Role-based access (benefactor, beneficiary, admin)

### Admin Portal
- User Management (view, delete users)
- Transition Verification Team (TVT) - review death certificates
- Designated Trustee Services (DTS) Management
- Customer Support Team - Real-time messaging portal
- Dev Switcher Configuration

### Benefactor Portal
- Document Vault (AES-256 encrypted)
- Milestone Messages (text/video with editable triggers)
- Beneficiary Management with enhanced demographics
- Estate Guardian AI (document analysis, checklist generation)
- Immediate Action Checklist
- Designated Trustee Services with Stripe Payment Integration
- Two-Level Section Security (Password + Voice Passphrase)
- Estate Readiness Score
- Edit Functionality for beneficiaries and documents
- Customer Support Chat
- Push Notifications (PWA)

### Beneficiary Portal
- Estate Hub with generational orbit visualization
- Pre-Transition view
- Death Certificate Upload (3-step wizard)
- Condolence Splash with 5-phase real-time status
- Post-Transition Dashboard
- Sealed Vault, Messages, Checklist access

### Deployment (NEW - Feb 2026)
- Backend Dockerfile (Python/FastAPI/uvicorn)
- Frontend Dockerfile (multi-stage: React build + nginx)
- docker-compose.yml for local development
- render.yaml for one-click Render deployment
- Production build script (strips Emergent-specific scripts)
- Health check endpoint (/api/health)
- VAPID key inline env var support (for managed services)
- Comprehensive DEPLOYMENT.md guide (Railway, Render, Docker Compose)

## Test Accounts
- **Admin**: `founder@carryon.us` / `CarryOntheWisdom!`

## Key Architecture
- **Backend**: FastAPI monolith (server.py ~3600 lines)
- **Frontend**: React SPA with Tailwind/shadcn
- **Database**: MongoDB
- **Deployment**: Dockerized, ready for Railway/Render/VPS

## 3rd Party Integrations
- OpenAI GPT-4o (Estate Guardian AI) via Emergent LLM Key
- OpenAI Whisper (voice passphrase) via Emergent LLM Key
- Resend (email OTP/invitations)
- Twilio (SMS OTP)
- Stripe (Setup Intents for DTS payments)

## Known Configuration Notes
- **Resend Email**: API key domain must match SENDER_EMAIL domain for production
- **SMS OTP**: Requires Twilio A2P 10DLC registration for production
- **Encryption Key**: Must be set via ENCRYPTION_KEY env var in production

## Upcoming Tasks (P1)
1. Multi-estate Support - Manage multiple estates per benefactor
2. Backend Refactoring - Break server.py into /routers, /models, /services

## Future/Backlog (P2)
1. Full Payment/Subscription Gateway (Stripe)
2. Digital Asset Management (cryptocurrency, social media)
3. PDF Export of estate plan summaries
4. Frontend component decomposition (TrusteePage, AdminPage)
5. Frontend lint warnings cleanup
