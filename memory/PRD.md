# CarryOn - Product Requirements Document

## Original Problem Statement
AI-powered estate planning platform for American families. Full-stack React + FastAPI + MongoDB application with mobile (Capacitor) and web deployments.

## Production Infrastructure
- **Database**: MongoDB Atlas
- **Backend**: FastAPI on Railway
- **Frontend Web**: React on Vercel (`app.carryon.us`)
- **Frontend Mobile**: Capacitor via Codemagic → TestFlight (iOS)
- **Domain**: `carryon.us` (GoDaddy)

## Core Features (Implemented)
- Estate document vault with AI analysis (Estate Guardian)
- Beneficiary management & invitations
- Milestone messages (text/voice/video)
- Immediate Action Checklist (auto-populated by AI)
- Designated Trustee Services
- Admin panel with Dev Switcher (admin-only)
- Digital Wallet Vault
- Photo cropping tool
- Legal pages (Privacy, Terms)
- Push notifications (Capacitor)

## 3rd Party Integrations
- Stripe (payments)
- Resend (email/OTP - currently disabled)
- Twilio (SMS)
- xAI/Grok (AI suggestions)
- OpenAI Whisper (voice transcription)
- Capgo (live mobile updates)

## What's Been Implemented (Latest Session - Feb 2026)
- [x] Landing page redesign with marketing content + login form
- [x] Hero layout: logo + tagline side by side (fills void)
- [x] Infinity symbol light tracer on logo
- [x] Simplified login label ("Sign In" instead of "Benefactor Sign In")
- [x] DEV switcher restricted to admin-only (fixes beneficiary visibility bug)
- [x] Vercel deployment unblocked via manual GitHub commits

## P1 - Upcoming Tasks
- Deploy mobile app fixes (Digital Wallet link in sidebar, splash screen logo) via Codemagic
- Investigate Resend email/OTP delivery and re-enable OTP login
- Full mobile app QA pass after next TestFlight build

## P2 - Future/Backlog
- App Store / Google Play submission
- Full device testing on real hardware
- Capgo live update integration (currently using full rebuilds)

## Credentials
- **User**: barnetharris@gmail.com / Blh9170873
- **Admin**: founder@carryon.us / CarryOntheWisdom!

## Key Files
- `frontend/src/pages/LoginPage.js` - Landing page + login
- `frontend/src/components/dev/DevSwitcher.js` - Admin dev switcher
- `frontend/src/components/Sidebar.js` - Navigation sidebar
- `backend/app/routes/auth.py` - Auth routes (OTP disabled)
- `codemagic.yaml` - Mobile CI/CD pipeline
