# CarryOn - Estate Planning & Legacy Management Platform

## Architecture (Refactored Feb 2026)
```
/app/backend/
├── server.py          — App init, router composition, middleware, weekly digest scheduler
├── config.py          — DB, env vars, external service clients
├── utils.py           — Encryption, auth, email, SMS, push, logging
├── voice_biometrics.py — Enhanced voice biometric engine
├── models.py          — Pydantic models, readiness calc, seed data
└── routes/
    ├── auth.py        — Login, register, OTP, dev-login
    ├── admin.py       — User mgmt, role management, activity log, stats
    ├── estates.py     — Estate CRUD, readiness routes
    ├── beneficiaries.py — Beneficiary CRUD, invitations, photos
    ├── documents.py   — Vault CRUD, voice verification
    ├── messages.py    — Milestone messages
    ├── checklist.py   — IAC CRUD
    ├── transition.py  — Death cert, transition flow
    ├── dts.py         — Trustee services, Stripe setup
    ├── guardian.py    — AI chat (Grok), estate analysis, generate_checklist from vault
    ├── subscriptions.py — Plans, checkout, admin pricing
    ├── support.py     — Customer support chat
    ├── family_plan.py — Family plan system
    ├── digital_wallet.py — Digital wallet vault
    ├── pdf_export.py  — PDF estate plan export
    ├── security.py    — Triple lock section security
    ├── push.py        — Push notification routes (subscribe/unsubscribe/VAPID)
    └── digest.py      — Weekly estate readiness digest (email, scheduler, preferences)
```

## Implemented Features
- Auth (OTP 2FA via email/SMS), Admin/Benefactor/Beneficiary portals
- SDV, MM, BM, IAC (full CRUD + AI suggestions), DTS, EGA (Grok), Digital Wallet Vault
- Triple Lock Security, PDF Export
- Stripe Subscriptions with admin controls
- Family Plan (admin-toggled)
- Legal Pages: Privacy Policy (/privacy) and Terms of Service (/terms)
- SMS Consent Checkbox (Twilio A2P 10DLC compliance)
- P0: AI Suggest from Vault — EGA auto-generates IAC items from vault documents
- P1: Admin Panel — user role management, activity log tab
- P2: Web Push Notifications — VAPID keys, service worker, settings toggle
- **Weekly Estate Readiness Digest** — Monday 8AM EST email with score trend + top 3 actions

## Key API Endpoints (Digest)
- `GET /api/digest/preferences` — Get user's digest opt-in status
- `PUT /api/digest/preferences` — Toggle weekly digest on/off
- `POST /api/digest/send-weekly` — Admin-only manual trigger
- `POST /api/digest/preview` — Send preview digest to current user

## DB Collections (Digest)
- `readiness_history` — Weekly score snapshots per estate (for trend calculation)
- `user_preferences` — Digest opt-in/out per user

## Recently Completed (Feb 2026)
1. Legal Pages & SMS Consent for Twilio A2P 10DLC
2. Full codebase audit: 0 Python lint errors, 0 JS warnings
3. P0: AI Suggest from Vault
4. P1: Admin Panel (role management, activity log)
5. P2: Web Push Notifications (VAPID keys, service worker)
6. Weekly Estate Readiness Digest

## Upcoming / Backlog
- Admin analytics dashboard with charts
- Multi-estate support
- Picovoice Eagle voice biometrics (parked — $6K/yr)
