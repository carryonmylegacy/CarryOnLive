# CarryOn™ - Product Requirements Document

## Original Problem Statement
CarryOn™ is an AI-powered estate planning platform that helps users ("benefactors") organize, secure, and pass on their legacy to designated beneficiaries. The platform includes secure document vaults, milestone messages, beneficiary management, an AI assistant (Estate Guardian), and more.

## Core Architecture
- **Frontend**: React (Vercel - app.carryon.us)
- **Backend**: FastAPI (Railway)
- **Database**: MongoDB Atlas
- **Payments**: Stripe (LIVE keys)
- **Mobile**: Capacitor/Codemagic (TestFlight)

## What's Been Implemented

### Authentication & User Management
- Email/password registration with OTP verification
- Login/logout with JWT tokens
- Role-based access (admin, benefactor, beneficiary)
- Date of birth collection on signup (for age-based tier eligibility)
- Dev-login restricted to admin accounts only

### Estate & Document Management
- Estate creation and management
- Secure Document Vault with AES-256 encryption
- Milestone Messages
- Beneficiary management with orbit visualization
- Immediate Action Checklist

### Subscription & Payment System
- 30-day free trial on signup
- 6 benefactor tiers: Premium $9.99, Standard $8.99, Base $7.99, New Adult $3.99, Military $5.99, Hospice Free
- 4 Beneficiary tiers: Base $4.99, Standard $3.99, Premium $2.99, Hospice $4.99
- Family Plan: $1/mo off for added benefactors, flat $3.49/mo for beneficiaries
- Billing cycles: Monthly, Quarterly (10% off), Annual (20% off)
- Paywall modal, trial banner, Stripe checkout integration (LIVE keys)
- Subscription management: upgrade/downgrade, billing cycle switch, cancel
- Family Plan savings visualization with recursive backend calculation

### Estate Guardian AI Chat (Feb 28, 2026 - Redesigned)
- Full-screen immersive chat experience with maximized message area
- Compact header with bot icon, title, New Chat button, Export PDF button
- Inline welcome actions: Analyze Vault, Generate Checklist, Readiness Score
- Suggested question chips on welcome state
- Popover-based actions/questions toggle after conversation starts
- Markdown rendering for AI responses
- Readiness score visualization with category breakdown
- Multi-turn conversation with session persistence

### Admin Controls
- Beta mode toggle, per-user discount/free access, family plan toggle
- Verification management, analytics dashboard, trial reminder trigger
- Support chat system, activity log, subscription management

### Security Hardening
- SecurityHeadersMiddleware, RateLimitMiddleware
- CORS tightened, dev-login restricted
- MongoDB _id exclusion 100% coverage
- No hardcoded secrets

## Code Architecture (Updated Feb 28, 2026)

```
/app
├── backend/
│   ├── routes/
│   │   ├── guardian.py              # AI chat with xAI Grok
│   │   ├── subscription.py         # Stripe webhooks, checkout
│   │   ├── subscription_management.py # Upgrade/downgrade/cancel
│   │   └── family_plan.py          # Family tree savings
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── SettingsPage.js      # REFACTORED (Feb 28)
│   │   │   ├── GuardianPage.js      # REDESIGNED (Feb 28)
│   │   │   └── AdminPage.js         # Needs refactoring (1588 lines)
│   │   ├── components/
│   │   │   ├── settings/            # NEW (Feb 28)
│   │   │   │   ├── PlanCard.js
│   │   │   │   ├── BillingToggle.js
│   │   │   │   └── SubscriptionManagement.js
│   │   │   ├── SubscriptionPaywall.js
│   │   │   └── visualization/
│   │   │       └── OrbitVisualization.js
│   │   └── contexts/
│   │       └── AuthContext.js
│   └── .env
├── codemagic.yaml                   # UPDATED (Feb 28)
└── memory/
    ├── PRD.md
    └── DEPLOY.md
```

## Deployment
- Manual Vercel deploy hook after GitHub push (hook URL in /app/memory/DEPLOY.md)
- Railway auto-deploys on push
- Stripe LIVE keys on both environments
- Codemagic for mobile builds (iOS/Android)

## Test Accounts
- **User**: barnetharris@gmail.com / Blh9170873
- **Admin**: founder@carryon.us / CarryOntheWisdom!
- **Local Admin**: admin@carryon.com / admin123

## Upcoming Tasks (Prioritized)
- P1: Re-enable OTP email via Resend (domain verification for carryontechnologies.com)
- P1: AdminPage.js refactoring (extract 9 tabs into separate components)
- P2: Animated logo (waiting on user transparent PNG/SVG asset)
- P2: Codemagic build verification after xcode optimization
- P3: Mobile app deploy via Codemagic
- P3: "You" label user verification on live site
