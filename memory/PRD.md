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

### Subscription & Payment System (Feb 27, 2026)
- **30-day free trial** on signup
- **Post-launch pricing** (6 benefactor tiers): Premium $9.99, Standard $8.99, Base $7.99, New Adult $3.99, Military $5.99, Hospice Free
- **4 Beneficiary tiers**: Base $4.99, Standard $3.99, Premium $2.99, Hospice $4.99
- **Family Plan**: 6th tile in paywall grid, $1/mo off for added benefactors, flat $3.49/mo for beneficiaries
- **Billing cycles**: Monthly, Quarterly (10% off), Annual (20% off)
- **Paywall modal**: 3x2 tile grid when trial expired
- **Trial banner**: Dashboard countdown with urgency colors
- **Stripe checkout** integration (LIVE keys)

### Trial Reminder System
- Background scheduler every 6 hours, emails at 10 days and 5 days before trial expiry
- Deduplication flags prevent re-sends
- Admin manual trigger endpoint

### Verification System
- Document upload for Military/First Responder and Hospice
- Admin review/approve/deny workflow
- Verified users access discounted tiers

### Subscription Analytics Dashboard
- 6 KPI cards: MRR, Trial Conversion %, Churn Rate %, Active Trials, Active Subs, Pending Reviews
- 4 charts: Signups (30-day line), Trial Funnel (donut), Tier Distribution (bar), Revenue by Tier (bar)

### Weekly Admin Analytics Digest
- Auto-sent every Monday with MRR, signups, conversions, churn, tier breakdown
- Preview modal and manual send from Analytics tab

### Security Hardening (Feb 27, 2026)
- **SecurityHeadersMiddleware**: X-Content-Type-Options (nosniff), X-Frame-Options (DENY), X-XSS-Protection, Referrer-Policy (strict-origin-when-cross-origin), Permissions-Policy, HSTS (1 year)
- **RateLimitMiddleware**: 20 requests/60s on auth endpoints (login, register, dev-login, verify-otp)
- **CORS tightened**: Specific origins (app.carryon.us, carryon.us, localhost) instead of wildcard
- **Dev-login restricted**: Only admin-role users can bypass OTP
- **All lint warnings fixed**: Python (ruff) and JavaScript (ESLint) clean
- **MongoDB _id exclusion**: 100% coverage across all route queries
- **No hardcoded secrets**: All credentials via .env

### Admin Controls
- Beta mode toggle, per-user discount/free access, family plan toggle
- Verification management, analytics dashboard, trial reminder trigger

## Deployment
- Manual Vercel deploy hook after GitHub push
- Railway auto-deploys
- Stripe LIVE keys on both environments

## Test Accounts
- **User**: barnetharris@gmail.com / Blh9170873
- **Admin**: founder@carryon.us / CarryOntheWisdom!
- **Local Admin**: admin@carryon.com / admin123

## Key API Endpoints
- Auth: register, login, dev-login (admin only), verify-otp
- Subscriptions: plans, status, checkout
- Verification: upload, status, admin review
- Admin: subscription-stats, trial-reminders/send, analytics-digest/preview, analytics-digest/send
- All admin endpoints require admin role (403 otherwise)

## Upcoming Tasks
- P1: Re-enable OTP email via Resend (domain verification for carryontechnologies.com)
- P2: Animated logo (waiting on user transparent PNG/SVG asset)
- P3: Mobile app deploy via Codemagic
- Refactor: Extract shared ThemedSection component from LoginPage/AboutPage
