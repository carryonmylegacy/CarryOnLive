# CarryOn - Product Requirements Document

## Original Problem Statement
AI-powered estate planning platform for American families. Full-stack React + FastAPI + MongoDB application with mobile (Capacitor) and web deployments.

## Production Infrastructure
- **Database**: MongoDB Atlas
- **Backend**: FastAPI on Railway
- **Frontend Web**: React on Vercel (`app.carryon.us`)
- **Frontend Mobile**: Capacitor via Codemagic -> TestFlight (iOS)
- **Domain**: `carryon.us` (GoDaddy)
- **Deploy Hook**: `https://api.vercel.com/v1/integrations/deploy/prj_ZDH4AJkNcf2vricEvD4KATpgRJZb/RXnUhbxeDr`
- **Stripe**: LIVE keys active (sk_live_ on Railway, pk_live_ on Vercel)

## Core Features (Implemented)
- Estate document vault with AI analysis (Estate Guardian)
- Beneficiary management & invitations
- Milestone messages (text/voice/video)
- Immediate Action Checklist (auto-populated by AI)
- Designated Trustee Services
- Admin panel with Dev Switcher (admin-only, persists through portal switches)
- Digital Wallet Vault
- Photo cropping tool
- Legal pages (Privacy, Terms)
- Push notifications (Capacitor)
- About page with full company content
- Live Stripe payment processing

## 3rd Party Integrations
- Stripe (payments - LIVE keys active)
- Resend (email/OTP - currently disabled)
- Twilio (SMS)
- xAI/Grok (AI suggestions)
- OpenAI Whisper (voice transcription)
- Capgo (live mobile updates)

## What's Been Implemented (Feb 27, 2026 Session)
- [x] Homepage redesign: American flag hero, scroll-reveal animations, layered sections
- [x] 7 thematic background textures (flag, roots, warmth, circuit, pathway, network, pulse)
- [x] About page with matching design/animations
- [x] Login simplified ("Sign In"), Safari autofill flicker fix
- [x] DEV switcher: admin-only + persists through portal switches
- [x] Orbit visualization: removed labels/legend, increased spacing, overflow clipped
- [x] Admin page overflow fix
- [x] Nav logo enlarged
- [x] Live Stripe keys wired in (Railway + Vercel)
- [x] TrusteePage.js hardcoded test key fixed
- [x] Backend: modernized FastAPI lifespan, archived 10 overlapping test files

## P0 - In Progress (Next Fork)
- **Subscription/Trial System**:
  - 30-day free trial for all new users
  - Email + in-app reminders at 10 and 5 days before expiry
  - Full-screen paywall after trial expires
  - Tier selection with monthly/quarterly pricing
  - Military/First Responder & Hospice verification flow
  - Admin approval for discounted tiers
  - **Awaiting user answers on**: tier names/prices, discount structures, reminder type, paywall behavior

## P1 - Upcoming Tasks
- Re-enable OTP/email via Resend domain verification
- Deploy mobile app fixes (Digital Wallet link, splash screen) via Codemagic
- Full mobile app QA pass

## P2 - Future/Backlog
- Infinity light effect in logo (needs transparent PNG/SVG)
- App Store / Google Play submission
- Full device testing on real hardware
- Capgo live update integration

## Backend Architecture (Post-Cleanup)
```
/app/backend/
  server.py          # Entry point, lifespan, router mounting (122 lines)
  config.py          # All external service configs (81 lines)
  utils.py           # Encryption, auth, email, SMS, push helpers (313 lines)
  models.py          # Pydantic models (354 lines)
  routes/            # 17 route files, well-separated by domain
  services/          # Business logic (readiness, voice_biometrics)
  tests/             # 3 active test suites
  tests/archive/     # 10 archived overlapping test files
```

## Credentials
- **User**: barnetharris@gmail.com / Blh9170873
- **Admin**: founder@carryon.us / CarryOntheWisdom!
