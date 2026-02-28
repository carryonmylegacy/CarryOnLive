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
- 6 benefactor tiers + 4 beneficiary tiers + Family Plan
- Billing cycles: Monthly, Quarterly (10% off), Annual (20% off)
- Stripe checkout integration (LIVE keys)
- Subscription management: upgrade/downgrade, billing cycle switch, cancel
- Family Plan savings visualization

### Estate Guardian AI Chat (Feb 28, 2026 - Major Upgrade)
- **Landing Page**: ChatGPT-like session hub with hero section, "Ask anything" input, quick action buttons, and last 20 recent conversations
- **Session Management**: Create new chats, resume previous conversations, delete sessions
- **Cross-Chat Knowledge**: AI has context from up to 5 recent sessions, enabling seamless references across conversations
- **Chat View**: Full-screen immersive chat with back arrow to return to landing
- **Actions**: Analyze Vault, Generate Checklist, Readiness Score
- **Features**: Markdown rendering, readiness score visualization, session persistence, Export PDF

### Admin Controls
- Beta mode toggle, per-user discount/free access, family plan toggle
- Verification management, analytics dashboard, trial reminder trigger
- Support chat system, activity log, subscription management

### Security Hardening
- SecurityHeadersMiddleware, RateLimitMiddleware
- CORS tightened, dev-login restricted
- MongoDB _id exclusion 100% coverage

## Code Architecture (Updated Feb 28, 2026)

```
/app
├── backend/
│   ├── routes/
│   │   ├── guardian.py              # AI chat: sessions list, cross-chat knowledge, delete
│   │   ├── subscription.py         # Stripe webhooks, checkout
│   │   ├── subscription_management.py # Upgrade/downgrade/cancel
│   │   └── family_plan.py          # Family tree savings
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── SettingsPage.js      # Refactored with extracted components
│   │   │   ├── GuardianPage.js      # Landing page + chat view with session management
│   │   │   └── AdminPage.js         # Needs refactoring (1588 lines)
│   │   ├── components/
│   │   │   ├── settings/
│   │   │   │   ├── PlanCard.js
│   │   │   │   ├── BillingToggle.js
│   │   │   │   └── SubscriptionManagement.js
│   │   │   ├── SubscriptionPaywall.js
│   │   │   └── visualization/
│   │   │       └── OrbitVisualization.js
│   │   └── contexts/
│   │       └── AuthContext.js
│   └── .env
├── codemagic.yaml
└── memory/
    ├── PRD.md
    └── DEPLOY.md
```

## Key API Endpoints
- `GET /api/chat/sessions` — List user's last 20 chat sessions with titles/timestamps
- `DELETE /api/chat/sessions/{session_id}` — Delete a chat session
- `GET /api/chat/history/{session_id}` — Get messages for a specific session
- `POST /api/chat/guardian` — Send message with cross-chat knowledge context
- Auth, Subscriptions, Verification, Admin endpoints (unchanged)

## Deployment
- Manual Vercel deploy hook after GitHub push (hook URL in /app/memory/DEPLOY.md)
- Railway auto-deploys on push
- Stripe LIVE keys on both environments

## Test Accounts
- **User**: barnetharris@gmail.com / Blh9170873
- **Admin**: founder@carryon.us / CarryOntheWisdom!
- **Local Admin**: admin@carryon.com / admin123

## Upcoming Tasks (Prioritized)
- P1: Re-enable OTP email via Resend (domain verification for carryontechnologies.com)
- P1: AdminPage.js refactoring (extract 9 tabs into separate components)
- P2: Animated logo (waiting on user transparent PNG/SVG asset)
- P2: Codemagic build verification
- P3: Mobile app deploy via Codemagic
