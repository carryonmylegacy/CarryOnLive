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

## 3rd Party Integrations
- Stripe (payments)
- Resend (email/OTP - currently disabled)
- Twilio (SMS)
- xAI/Grok (AI suggestions)
- OpenAI Whisper (voice transcription)
- Capgo (live mobile updates)

## What's Been Implemented (Latest Session - Feb 27, 2026)
- [x] Landing page redesign with marketing content + login form
- [x] Hero layout: logo + tagline side by side
- [x] American flag background with scroll-fade effect
- [x] Scroll-reveal animations on all sections
- [x] Layered sections with rounded overlapping edges + shadows
- [x] Background textures (constellation, shield) for visual depth
- [x] Staggered card entrance animations
- [x] Hover effects on buttons, cards, step numbers
- [x] Simplified login label ("Sign In" instead of "Benefactor Sign In")
- [x] Safari autofill flicker fix
- [x] DEV switcher: admin-only, persists through portal switches via localStorage
- [x] About page with full company content, matching design/animations
- [x] Orbit visualization: removed name labels, removed legend
- [x] Family member tiles list on beneficiary hub page
- [x] Orbit spacing increased for breathing room
- [x] Admin page overflow fix (max-width + overflow-x-hidden)
- [x] Vercel deploy hook set up as permanent deployment solution
- [x] Backend housekeeping:
  - Modernized FastAPI lifespan (replaced deprecated on_event)
  - Archived 10 overlapping test files, kept 3 active suites
  - All lint passes clean

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

## P1 - Upcoming Tasks
- Deploy mobile app fixes (Digital Wallet link, splash screen) via Codemagic
- Investigate Resend email/OTP delivery and re-enable OTP login
- Full mobile app QA pass after next TestFlight build

## P2 - Future/Backlog
- Infinity light effect in logo (needs transparent PNG/SVG)
- App Store / Google Play submission
- Full device testing on real hardware
- Capgo live update integration

## Credentials
- **User**: barnetharris@gmail.com / Blh9170873
- **Admin**: founder@carryon.us / CarryOntheWisdom!
