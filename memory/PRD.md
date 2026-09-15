# CarryOn - Family Preparedness Platform

## Original Problem Statement
Build and maintain a comprehensive family preparedness platform that helps users organize their estate plans, secure important documents, and leave messages for beneficiaries.

## Core Requirements
- Secure document vault with AES-256 encryption
- Milestone messaging (written, voice, video) 
- Beneficiary management with succession ordering
- AI-powered Estate Guardian advisor
- Immediate Action Checklist for beneficiaries
- Digital Access Vault for account credentials
- Guided onboarding / Getting Started flow
- Multi-role support (Benefactor, Beneficiary, Admin/Founder)
- iOS/PWA hybrid with Capacitor
- CarryOn Contingency Protocols (CCP) — family emergency plans
- Estate Communication Tool (ECT) — secure family chat
- CarryOn Financial Portal (CFP) — bills, debts, accounts management

## Architecture
- Frontend: React (CRA + Craco) + Capacitor
- Backend: FastAPI + MongoDB
- Storage: S3-compatible object storage
- Auth: JWT + OTP + Passkeys
- Deployment: Vercel

## What's Been Implemented

### Completed (All Previous Sessions)
- Full authentication system (JWT, OTP, passkeys, session enforcement)
- Beneficiary management with drag-to-reorder succession
- Milestone Messages (written, voice, video with S3 storage)
- Secure Document Vault (AES-256-GCM, voice unlock)
- Estate Guardian AI chat
- Immediate Action Checklist with AI generation
- Digital Access Vault
- Admin/Founder multi-portal system
- Stripe payments + Apple IAP integration
- Family Plan support
- Notification system (in-app + email + push)
- SEO (robots.txt, sitemap.xml, meta tags)
- Getting Started UX Overhaul (foolproof for elderly/non-tech users)
- CCP First-Visit Welcome Walkthrough
- ECT Enhanced Security Intro
- PWA Badge Sync Fix
- Photo Save Fix on iOS
- Blob Image Memory Reclamation
- Push Notification Prompt Resilience
- Getting Started Multi-Step Dismiss Logic with frosted glass overlays
- All prior platform-wide fixes (Google Places, phone formatting, date formatting, etc.)

### Completed (Apr 12, 2026 Session)
- **CarryOn Financial Portal (CFP)**: Complete feature with Bill Tracker, Debt Tracker, Accounts Registry, Financial Summary Dashboard, Bill Calendar, Per-Beneficiary Designation, Custom Categories, Mark as Paid, Dashboard Tile, Sidebar Nav, Bill Reminder Scheduler, Financial Health Score, Dual Dashboard Gauges, Bill Cancellation Advisor, CFP Dock Items, Smart Bill Categorization, Quick Add (Bulk Import)
- **Email Deliverability Fix**: Centralized email service with bounce handling
- **Platform-Wide Light Mode Audit**: Complete color variable fixes
- Backend: `/app/backend/routes/financial_portal.py` (21 routes)
- Frontend: `/app/frontend/src/pages/FinancialPortalPage.js` + 7 components
- Testing: 40/40 tests pass, Housekeeping: 64/65 PASS

### Completed (Sep 15, 2026 Session — Revenue Funnel Overhaul)
- **Stripe Subscription Migration**: Converted to native Stripe Subscriptions via `setup_stripe_catalog.py` (18 prices)
- **Funnel Intake Page**: Built `/start` with two-door funnel ("Start today" / "Explore first")
- **Trial Enhancements**: DB-configurable trial duration, "exploration period" language, non-dismissable TrialBanner, hard paywall at expiry
- **Analytics**: UTM capture during signup, persisting to user record
- **Email Bounce Handlers**: Resend webhook + centralized email service
- **Marketing Pages**: `/pricing` page with portal-driven pricing, removed "130+ Families" stat, homepage CTAs → `/start`
- **Phase 3 Zero-Regression Guardrails**: All 9 verification tests PASSED
  1. Admin login ✅
  2. Plans API (8 plans, correct pricing) ✅
  3. Subscription status (trial/beta/access flags) ✅
  4. Checkout flow (beta mode → free) ✅
  5. Webhook endpoint (accepts payloads) ✅
  6. Plan change (beta mode switch) ✅
  7. Cancel flow ✅
  8. Admin settings API ✅
  9. User subscriptions data integrity ✅
- **SEO / AI-Readability Overhaul**: 
  - Installed `react-helmet-async` with `HelmetProvider` in App.js
  - Added per-page `<Helmet>` with custom title, description, OG, Twitter meta tags to `/start`, `/pricing`, `/home`
  - Added JSON-LD structured data (Schema.org) to all 3 pages:
    - `/home`: WebApplication with featureList + AggregateOffer
    - `/start`: WebPage with ItemList of Product/Offer plans
    - `/pricing`: WebPage with ItemList of Product/Offer plans (6 plans with prices)
  - Updated sitemap.xml: 3 → 9 URLs (/start, /pricing, /home, /about, /privacy, /terms added)
  - Fixed sitemap namespace typo (sitemapns.org → sitemaps.org)
  - Testing: 4/4 SEO tests PASSED
- Housekeeping: 64/64 PASS, 0 FAIL

## Blocked Items
- Apple IAP: Waiting on Paid Applications Agreement
- Twilio SMS: Waiting on A2P 10DLC campaign approval

## Upcoming Tasks
- (P0) Google Play Store Launch
- (P1) iOS Share Extension Setup
- (P1) iOS Live Updates (Capgo)
- (P2) iOS Font Size Fix (37 sub-11px font instances in housekeeping WARN)

## Future/Backlog
- (P2) CFP Getting Started Integration — Add CFP step to onboarding wizard
- (P2) Readiness Scoring Policy Page
- (P3) ECT Security Comparison Landing Page

## Refactoring Completed
- **EstateChatPage.js refactored** (Apr 12, 2026): Reduced from 2516 → 2029 lines

## Key Technical Notes
- Housekeeping: `bash /app/housekeeping.sh` must pass 64+ before every push
- State sync: Frontend media removals must explicitly call backend DELETE endpoints
- Narrative: Use "family preparedness" not "estate planning"
- MongoDB: Always exclude `_id` from responses
- First-visit intros use localStorage: `carryon_ccp_intro_seen`, `ect_security_seen`
- Financial Portal uses soft-delete (`deleted_at` field) on all records
- Custom categories stored in `bill_categories` collection, module-scoped
- **Dynamic Pricing**: Never hardcode prices — always fetched from Founder Portal DB config
- **Stripe Native Subscriptions**: `checkout.py` uses `mode='subscription'` with lookup keys
- **UTM Capture**: `utm_*` tags captured in sessionStorage, persisted to user record
- **JSON-LD Structured Data**: Rendered via `dangerouslySetInnerHTML` outside `<Helmet>` (Helmet crashes with dynamic script children)
- **react-helmet-async**: HelmetProvider wraps app in App.js. Per-page Helmet in StartPage, PricingPage, HomePage
- **LIVE Stripe keys**: Exercise extreme caution when testing billing
- **Beta mode currently ON**: Checkout returns `{free: true}` instead of creating Stripe sessions
