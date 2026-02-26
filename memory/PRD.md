# CarryOn - Estate Planning & Legacy Management Platform

## Architecture (Refactored Feb 2026)
```
/app/backend/
├── server.py          — App init, router composition, middleware
├── config.py          — DB, env vars, external service clients
├── utils.py           — Encryption, auth, email, SMS, push, logging
├── voice_biometrics.py — Enhanced voice biometric engine
├── models.py          — Pydantic models, readiness calc, seed data
└── routes/
    ├── auth.py        — Login, register, OTP, dev-login
    ├── admin.py       — User mgmt, role management, activity log, stats, dev switcher
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
    └── push.py        — Push notification routes (subscribe/unsubscribe/VAPID)
```

## Implemented Features
- Auth (OTP 2FA via email/SMS), Admin/Benefactor/Beneficiary portals
- SDV, MM, BM, IAC (full CRUD + AI suggestions), DTS, EGA (Grok), Digital Wallet Vault
- Triple Lock Security, PDF Export
- Stripe Subscriptions with admin controls
- Family Plan (admin-toggled)
- Legal Pages: Privacy Policy (/privacy) and Terms of Service (/terms)
- SMS Consent Checkbox on signup (Twilio A2P 10DLC compliance)
- **P0: AI Suggest from Vault** — EGA auto-generates IAC items from vault documents via Grok
- **P1: Admin Panel enhancements** — user role management (dropdown), activity log tab
- **P2: Web Push Notifications** — VAPID keys, service worker, NotificationSettings component
- Deployment ready (Dockerfiles, render.yaml, DEPLOY_GUIDE.md)

## API Keys Active
- xAI Grok, Stripe (test), Resend, Twilio, Emergent LLM (Whisper), VAPID keys

## Key API Endpoints
- `PUT /api/admin/users/{user_id}/role` — Change user role (admin only)
- `GET /api/admin/activity` — Platform activity log (admin only)
- `GET /api/push/vapid-public-key` — VAPID public key (public)
- `POST /api/push/subscribe` — Subscribe to push notifications
- `POST /api/chat/guardian` with `action: generate_checklist` — AI suggests IAC items from vault

## Recently Completed (Feb 2026)
1. Legal Pages & SMS Consent for Twilio A2P 10DLC
2. Full codebase audit: 0 Python lint errors, 0 JS warnings
3. P0: AI Suggest from Vault (Grok reads SDV docs, auto-creates IAC items)
4. P1: Admin Panel (role management dropdown, activity log tab, enhanced stats)
5. P2: Web Push Notifications (VAPID keys generated, service worker, settings UI)

## Upcoming / Backlog
- P1: Admin Panel further buildout (analytics dashboard, charts)
- Multi-estate support
- Picovoice Eagle voice biometrics (parked — $6K/yr)
