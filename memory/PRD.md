# CarryOn™ - Estate Planning & Legacy Management Platform

## Original Problem Statement
Build a full-stack web app called CarryOn™ — a secure estate planning and legacy management platform with three distinct portals: Benefactor, Beneficiary, and Admin.

## What's Been Implemented (Complete)

### Authentication & Security
- Email/Password login with 6-digit OTP 2FA (email + SMS)
- Triple Lock Section Security: Password + Voice Biometric + Security Question per section
- 3 lock behavior modes per section (auto on page leave, on logout, manual)
- Dedicated Security Settings page in nav

### Admin Portal
- User Management, TVT, DTS Management, Customer Support Team
- **Subscription Management** (NEW): Beta mode toggle, plan pricing editor, per-user free access + custom discounts
- Dev Switcher Configuration

### Benefactor Portal
- SDV, MM, BM, IAC, DTS, EGA — all with Triple Lock security support
- Estate Guardian AI (powered by Grok/xAI)
- Estate Readiness Score, Customer Support Chat, Push Notifications

### Beneficiary Portal
- Estate Hub, Pre/Post-Transition views, Sealed Vault access

### Stripe Subscription System (NEW - Feb 2026)
- 6 plan tiers: Premium ($8.99), Standard ($7.99), Base ($6.99), New Adult ($3.99), Military ($5.99), Hospice (Free)
- Admin controls: platform-wide beta toggle, per-plan pricing editor, per-user free access + custom discount
- Stripe checkout integration via emergentintegrations
- Payment transactions tracked in MongoDB
- Beta banner ("BETA = FREE") when beta mode is ON

### Deployment Ready
- Dockerfiles, docker-compose.yml, render.yaml, DEPLOY_GUIDE.md

## Subscription Pricing Notes
- Premium/Standard/Base: Adjustable (launch discount = $1 off final price)
- Final prices: Premium $9.99, Standard $8.99, Base $7.99
- New Adult/Military/Hospice: Fixed pricing, no discounts
- Beneficiary pricing based on benefactor's plan tier
- Billing: monthly, quarterly (2.7x), annual (10x)

## 3rd Party Integrations
- xAI Grok (EGA), OpenAI Whisper (voice STT), Resend, Twilio, Stripe

## Upcoming Tasks
1. Picovoice Eagle upgrade for voice biometric (awaiting API key)
2. Get user's Stripe API key (instructions provided)
3. Get user's xAI API key
4. Multi-estate support, Backend refactoring

## Future/Backlog
1. Digital Asset Management, PDF Export
2. Family plan pricing, Minor beneficiary free access
3. Frontend component decomposition
