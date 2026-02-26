# CarryOn - Estate Planning & Legacy Management Platform

## Architecture (Refactored Feb 2026)
```
/app/backend/
├── server.py          84 lines  — App init, router composition, middleware
├── config.py          73 lines  — DB, env vars, external service clients
├── utils.py          164 lines  — Encryption, auth, email, SMS, push, logging
├── voice_biometrics.py 310 lines — Enhanced voice biometric engine
├── models.py         685 lines  — Pydantic models, readiness calc, seed data
└── routes/
    ├── auth.py       172 lines  — Login, register, OTP, dev-login
    ├── admin.py      146 lines  — User mgmt, stats, dev switcher
    ├── estates.py    237 lines  — Estate CRUD, readiness routes
    ├── beneficiaries.py 433 lines — Beneficiary CRUD, invitations
    ├── documents.py  439 lines  — Vault CRUD, voice verification
    ├── messages.py   162 lines  — Milestone messages
    ├── checklist.py   65 lines  — IAC
    ├── transition.py 155 lines  — Death cert, transition flow
    ├── dts.py        290 lines  — Trustee services, Stripe setup
    ├── guardian.py   395 lines  — AI chat (Grok), estate analysis
    ├── subscriptions.py 478 lines — Plans, checkout, admin pricing
    ├── support.py    174 lines  — Customer support chat
    ├── family_plan.py 267 lines — Family plan system
    ├── digital_wallet.py 183 lines — Digital wallet vault
    ├── pdf_export.py 241 lines  — PDF estate plan export
    ├── security.py   402 lines  — Triple lock section security
    └── push.py        78 lines  — Push notification routes
```

## Implemented Features
- Auth (OTP 2FA), Admin/Benefactor/Beneficiary portals
- SDV, MM, BM, IAC, DTS, EGA (Grok), Digital Wallet Vault
- Triple Lock Security, PDF Export, Push Notifications
- Stripe Subscriptions with admin controls (beta toggle, pricing, per-user overrides)
- Family Plan (admin-toggled, FPO + Successor + pricing model)
- Deployment ready (Dockerfiles, render.yaml, DEPLOY_GUIDE.md)
- **Legal Pages**: Privacy Policy (/privacy) and Terms of Service (/terms) — public pages with SMS/A2P 10DLC compliant content
- **SMS Consent Checkbox**: Mandatory opt-in on signup form for Twilio A2P 10DLC compliance
- Footer legal links on Login and Signup pages

## API Keys Active
- xAI Grok, Stripe (test), Emergent LLM (Whisper)

## Recently Completed
1. Enhanced voice biometric engine (voice_biometrics.py)
2. Production deployment readiness (Dockerfiles, render.yaml, build-prod.sh, deploy guides)
3. Full code cleanup: 0 Python lint errors, 0 JS lint errors
4. Beneficiary photo uploads (end-to-end)
5. IAC overhaul (benefactor CRUD + beneficiary checklist view)
6. Safari pulsating fix, Outlook OTP email fix
7. **Legal Pages & SMS Consent for Twilio A2P 10DLC** (Feb 2026)
   - Privacy Policy page with dedicated SMS/Text Messaging section
   - Terms of Service page with SMS Communications Consent section
   - SMS consent checkbox on registration form (mandatory)
   - Footer links to legal pages on Login and Signup pages

## Upcoming
1. P0: Estate Guardian AI - "AI Suggest from Vault" (xAI/Grok reads SDV docs to suggest IAC items)
2. P1: Admin Panel buildout (user management, analytics)
3. P2: Web Push Notifications (VAPID keys, service worker)

## Parked
- Multi-estate support
- Picovoice Eagle (pricing: $6K/yr — deferred; using enhanced librosa engine instead)
