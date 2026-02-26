# CarryOn™ - Estate Planning & Legacy Management Platform

## What's Been Implemented

### Core Features
- Auth (OTP 2FA), Admin/Benefactor/Beneficiary portals
- SDV, MM, BM, IAC, DTS, EGA (Grok-powered)
- Triple Lock Security, Estate Readiness Score
- Customer Support Chat, Push Notifications (PWA)
- Digital Wallet Vault, PDF Estate Plan Export

### Subscription System
- 6 plan tiers with Stripe checkout
- Admin: beta toggle, pricing editor, per-user overrides (free access, custom discount)
- Beta banner ("BETA = FREE")

### Family Plan (Admin-Toggled, Currently Hidden)
- FPO (Family Plan Owner) + Successor designation
- $1/mo discount for added benefactors (floor-exempt tiers excluded)
- Flat $3.49/mo for all beneficiaries
- Admin toggle to show/hide from users
- Succession logic: Successor inherits FPO role on transition
- Recommended launch: L+3 to L+4 months

### Deployment Ready
- Dockerfiles, render.yaml, DEPLOY_GUIDE.md
- All API keys configured (xAI Grok, Stripe, Emergent LLM)

## Pricing
- Premium: $8.99 (launch) → $9.99 (post-launch)
- Standard: $7.99 → $8.99
- Base: $6.99 → $7.99
- New Adult: $3.99 (fixed), Military: $5.99 (fixed), Hospice: Free (fixed)
- Beneficiary: tier-based ($2.99-$4.99), Family Plan flat: $3.49

## Parked Tasks
- Multi-estate support (manage multiple estates from one account)

## Upcoming
1. Picovoice Eagle upgrade (when trial approved)
2. Production deployment to Render
3. Backend refactoring (post-launch housekeeping)

## Future/Backlog
- Frontend component decomposition
- Minor beneficiary free access until 18
