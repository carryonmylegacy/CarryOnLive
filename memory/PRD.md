# CarryOn™ - Estate Planning & Legacy Management Platform

## What's Been Implemented

### Core Features
- Authentication (OTP 2FA), Admin/Benefactor/Beneficiary portals
- Secure Document Vault (SDV), Milestone Messages (MM), Beneficiary Management (BM)
- Immediate Action Checklist (IAC), Designated Trustee Services (DTS)
- Estate Guardian AI (EGA) — powered by xAI Grok
- Estate Readiness Score, Customer Support Chat, Push Notifications

### Digital Wallet Vault (NEW)
- Store digital account credentials (crypto, email, social media, banking, cloud, subscriptions)
- AES-256 encrypted passwords and access info
- Per-entry beneficiary assignment — each account assigned to specific beneficiary
- Post-transition: beneficiaries see only their assigned accounts
- Sidebar nav only (not on dashboard tiles or mobile bottom bar)

### PDF Estate Plan Export (NEW)
- Prominent "Export Estate Plan" button on Estate Guardian AI page
- Action items FIRST (missing documents, pending checklist, incomplete beneficiary info, DTS tasks)
- Estate status backup (documents list, beneficiaries, checklist, messages, DTS summary)
- Branded PDF with legal disclaimer

### Triple Lock Section Security
- 3 layers: Password, Voice Biometric (MFCC), Security Question
- 3 lock modes per section, dedicated Security Settings page

### Stripe Subscription System
- 6 plan tiers, beta mode toggle, per-user overrides
- Admin: pricing editor, free access toggle, custom discounts

### Deployment Ready
- Dockerfiles, render.yaml, DEPLOY_GUIDE.md

## API Keys Configured
- xAI Grok (Estate Guardian AI)
- Stripe (test keys — publishable + secret)
- Emergent LLM Key (voice/Whisper)
- Picovoice Eagle — pending trial approval (24hr)

## Upcoming Tasks (P1)
1. Family Plan system (admin-toggled, full pricing model per strategy doc)
2. Picovoice Eagle upgrade (when trial approved)
3. Production deployment to Render

## Parked Tasks
- Multi-estate support (single benefactor managing multiple estates)

## Future/Backlog (P2)
- Family plan pricing implementation
- Minor beneficiary free access until 18
- Backend refactoring (server.py → modular)
- Frontend component decomposition
