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

### Estate & Document Management
- Estate creation and management
- Secure Document Vault with AES-256 encryption
- Milestone Messages
- Beneficiary management with orbit visualization
- Immediate Action Checklist

### Subscription & Payment System (Feb 27, 2026)
- **30-day free trial** on signup (`trial_ends_at` field)
- **Post-launch pricing** (6 benefactor tiers):
  - Premium: $9.99/mo | Q: $8.99 | A: $7.99
  - Standard: $8.99/mo | Q: $8.09 | A: $7.19
  - Base: $7.99/mo | Q: $7.19 | A: $6.39
  - New Adult (18-25): $3.99/mo (auto-detected by DOB)
  - Military/First Responder: $5.99/mo (requires verification)
  - Hospice: Free (requires verification)
- **4 Beneficiary tiers**: Base $4.99, Standard $3.99, Premium $2.99, Hospice $4.99
- **Family Plan**: FPO pays standard rate, added benefactors $1/mo off, all beneficiaries flat $3.49/mo (6th tile in paywall grid)
- **Billing cycles**: Monthly, Quarterly (10% off), Annual (20% off)
- **Paywall modal**: 3x2 tile grid (6 tiles) when trial expired
- **Trial banner**: Dashboard countdown with urgency colors
- **Stripe checkout** integration (LIVE keys)

### Trial Reminder System (Feb 27, 2026)
- Background scheduler runs every 6 hours
- Sends HTML email reminders via Resend at 10 days and 5 days before trial expiration
- Deduplication via `trial_reminder_10d_sent` / `trial_reminder_5d_sent` flags
- Admin manual trigger endpoint: `POST /api/admin/trial-reminders/send`

### Verification System (Feb 27, 2026)
- Document upload for Military/First Responder (Military ID, badge)
- Document upload for Hospice (enrollment documentation)
- Admin review/approve/deny verification requests
- Verified users get access to discounted tiers

### Subscription Analytics Dashboard (Feb 27, 2026)
- **6 KPI cards**: MRR, Trial Conversion %, Churn Rate %, Active Trials, Active Subs, Pending Reviews
- **Signups — Last 30 Days**: Line chart with daily signup counts
- **Trial Funnel**: Donut chart (Active Trial / Converted / Expired / Churned)
- **Tier Distribution**: Bar chart showing subscribers per tier
- **Monthly Revenue by Tier**: Bar chart showing revenue contribution per tier
- Refresh button for on-demand data refresh

### Admin Controls (Feb 27, 2026)
- **Beta mode toggle** (global free access for all users)
- **Per-user discount** (0-100% off any amount)
- **Per-user free access** toggle
- **Family plan visibility** toggle
- **Verification management** tab
- **Analytics dashboard** tab
- **Manual trial reminder trigger**

### UI/UX
- Dark bank-style theme with gold accents
- Layered scrolling animations on login/about pages
- Thematic background textures
- DevSwitcher for admin testing

## Deployment
- **Manual Vercel deploy hook** required after GitHub push (webhook is broken)
- Railway auto-deploys from GitHub
- Stripe uses LIVE keys on both environments

## Test Accounts
- **User**: barnetharris@gmail.com / Blh9170873
- **Admin**: founder@carryon.us / CarryOntheWisdom!
- **Local Admin**: admin@carryon.com / admin123

## Key API Endpoints
- `POST /api/auth/register` - User registration with trial
- `GET /api/subscriptions/plans` - All plans with pricing
- `GET /api/subscriptions/status` - User subscription/trial status
- `POST /api/subscriptions/checkout` - Stripe checkout
- `POST /api/verification/upload` - Tier verification documents
- `GET /api/admin/verifications` - List all verifications
- `POST /api/admin/verifications/{id}/review` - Approve/deny
- `GET /api/admin/subscription-stats` - Full analytics data
- `POST /api/admin/trial-reminders/send` - Manual reminder trigger

## Upcoming Tasks (Prioritized)
- P1: Re-enable OTP email via Resend (domain verification for carryontechnologies.com)
- P2: Animated logo (waiting on user transparent PNG/SVG asset)
- P3: Mobile app deploy via Codemagic
- Refactor: Extract shared ThemedSection component from LoginPage/AboutPage
