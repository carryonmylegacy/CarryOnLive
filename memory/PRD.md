# CarryOn - Estate Planning & Legacy Management Platform

## Architecture (Refactored Feb 2026)
```
/app/backend/
├── server.py          110 lines — App init, router composition, digest scheduler
├── config.py           73 lines — DB, env vars, external service clients
├── utils.py           202 lines — Auth helpers (token, password, OTP, email, SMS, push)
├── models.py          305 lines — Pydantic models and schemas ONLY
├── services/
│   ├── readiness.py   362 lines — Estate readiness scoring, milestones, seed data
│   └── voice_biometrics.py 473 lines — Voice biometric engine (librosa + scipy)
├── routes/
│   ├── auth.py        170 lines — Login, register, OTP, dev-login
│   ├── admin.py       233 lines — User mgmt, role management, activity log, stats
│   ├── estates.py     238 lines — Estate CRUD, readiness routes
│   ├── beneficiaries.py 512 lines — Beneficiary CRUD, invitations, photos
│   ├── documents.py   439 lines — Vault CRUD, voice verification
│   ├── messages.py    162 lines — Milestone messages
│   ├── checklist.py   120 lines — IAC CRUD
│   ├── transition.py  155 lines — Death cert, transition flow
│   ├── dts.py         290 lines — Trustee services, Stripe setup
│   ├── guardian.py    376 lines — AI chat (Grok), estate analysis, checklist gen
│   ├── subscriptions.py 477 lines — Plans, checkout, admin pricing
│   ├── support.py     174 lines — Customer support chat
│   ├── family_plan.py 267 lines — Family plan system
│   ├── digital_wallet.py 183 lines — Digital wallet vault
│   ├── pdf_export.py  266 lines — PDF estate plan export
│   ├── security.py    386 lines — Triple lock section security
│   ├── push.py         84 lines — Push notification routes
│   └── digest.py      306 lines — Weekly readiness digest (email, scheduler, prefs)
└── tests/             10 test files
```

## Implemented Features
- Auth (OTP 2FA via email/SMS), Admin/Benefactor/Beneficiary portals
- SDV, MM, BM, IAC (full CRUD + AI suggestions), DTS, EGA (Grok), Digital Wallet Vault
- Triple Lock Security, PDF Export
- Stripe Subscriptions with admin controls
- Family Plan (admin-toggled)
- Legal Pages: Privacy Policy (/privacy) and Terms of Service (/terms)
- SMS Consent Checkbox (Twilio A2P 10DLC compliance)
- AI Suggest from Vault — EGA auto-generates IAC items from vault documents
- Admin Panel — user role management, activity log tab
- Web Push Notifications — VAPID keys, service worker, settings toggle
- Weekly Estate Readiness Digest — Monday 8AM EST email with score trend + top 3 actions

## Key API Endpoints
- Auth: `/api/auth/login`, `/api/auth/verify-otp`, `/api/auth/dev-login`
- Admin: `/api/admin/stats`, `/api/admin/users/{id}/role`, `/api/admin/activity`
- Estates: `/api/estates`, `/api/estates/{id}/readiness`
- Digest: `/api/digest/preferences`, `/api/digest/send-weekly`, `/api/digest/preview`
- Push: `/api/push/vapid-public-key`, `/api/push/subscribe`

## DB Collections
- `users`, `estates`, `beneficiaries`, `documents`, `messages`, `checklists`
- `readiness_history` — Weekly score snapshots
- `user_preferences` — Digest opt-in/out
- `activity_log` — Admin action audit trail

## API Keys Active
- xAI Grok, Stripe (test), Resend, Twilio, Emergent LLM (Whisper), VAPID keys

## Code Quality Status (Feb 2026)
- Backend: `ruff check .` → All checks passed (0 errors)
- Backend: `ruff format .` → All files formatted
- Frontend: `yarn build` → Compiled successfully (0 warnings)
- Testing: 40/40 backend API tests passed, all frontend UI verified

## Upcoming / Backlog
- Admin analytics dashboard with charts
- Multi-estate support
- Picovoice Eagle voice biometrics (parked — $6K/yr)
