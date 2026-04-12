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

### Completed (Current Session — Apr 12, 2026)
- **CarryOn Financial Portal (CFP)**: Complete new feature with 3 sub-modules
  - **Bill Tracker (CBT)**: Full CRUD for bills with 13 default categories + custom user categories, due day tracking, auto-pay indicator, payment method/account, biller contact info, reminder schedule (customizable per-bill), priority levels, DAV deep-linking, notes for beneficiaries
  - **Debt Tracker (CDT)**: Full CRUD for debts with categories (mortgage, auto loan, student loan, etc.), outstanding balance, interest rate, monthly payment, loan term, collateral, co-signer, life insurance linkage, DAV deep-linking
  - **Accounts Registry (CAR)**: Full CRUD for financial accounts with categories (checking, savings, investment, retirement, etc.), balance tracking, institution info, ownership type (individual, joint, trust, POD/TOD), named beneficiary at institution, DAV deep-linking
  - **Financial Summary Dashboard**: Real-time aggregation cards showing Monthly Bills total, Total Debt, Total Assets, Net Position
  - **Bill Calendar**: Interactive monthly calendar with colored dots per bill category, day selection shows bill details, monthly total footer
  - **Per-Beneficiary Designation**: Each bill/debt/account supports per-beneficiary visibility with Pre/Post transition timing toggles (same SDV pattern)
  - **Custom Categories**: Benefactors can create custom categories via +Add New Category in any form dropdown; custom categories instantly appear as filter bubbles
  - **Mark as Paid**: Bill payment tracking with history
  - **Dashboard Tile**: CFP tile on benefactor dashboard showing summary stats and upcoming bills
  - **Sidebar Navigation**: CFP nav item added to benefactor sidebar
  - **Feature Access Toggle**: `cfp_access` toggle added to beneficiary feature access settings
  - **Section Permissions**: `financial_portal` added to ALL_SECTIONS for section-level gating
  - **Beneficiary Financial Page**: Read-only view at `/beneficiary/financial` with Mark as Paid button (post-transition only), calendar view, summary cards, and 3 sub-tabs
  - **Bill Reminder Scheduler**: `bill_reminder_scheduler` runs daily at 9 AM EST, sends push + in-app notifications to beneficiaries of transitioned estates at 10, 7, 5, 3, 1, and 0 days before each bill's due date
  - **Financial Health Score**: New gauge on dashboard showing a 0-100 score based on: coverage (bills/debts/accounts), auto-pay %, beneficiary designations, DAV links, and notes/instructions
  - **Dual Dashboard Gauges**: Estate Readiness Score (left) + Financial Health Score (right) displayed side-by-side like speedometer and tachometer
  - **Bill Cancellation Advisor**: Post-transition overlay for optional/subscription bills with 5-step cancellation checklist, benefactor's pre-written instructions, click-to-call biller phone, portal URL link, and auto-pay warning
  - **CFP Dock Items**: Financial Portal added to mobile bottom dock defaults for both benefactor (`/financial`) and beneficiary (`/beneficiary/financial`) with DollarSign icon
  - Backend: `/app/backend/routes/financial_portal.py` (21 routes, 741 lines)
  - Frontend: `/app/frontend/src/pages/FinancialPortalPage.js` + 7 components in `/app/frontend/src/components/financial/` + `/app/frontend/src/pages/beneficiary/BeneficiaryFinancialPage.js`
  - MongoDB collections: `bills`, `debts`, `financial_accounts`, `bill_categories`, `bill_payments`
  - DB indexes: 6 new indexes for financial collections
  - Testing: 40/40 tests pass (27 initial + 13 extension), all frontend UI verified
  - Housekeeping: 64/65 PASS, 0 FAIL

## Blocked Items
- Apple IAP: Waiting on Paid Applications Agreement
- Twilio SMS: Waiting on A2P 10DLC campaign approval

## Upcoming Tasks
- (P0) Google Play Store Launch
- (P1) Share Extension Setup (iOS)
- (P1) iOS Live Updates (Capgo)

## Future/Backlog
- (P2) CFP Getting Started Integration — Add CFP step to onboarding wizard
- (P2) Readiness Scoring Policy Page
- (P3) ECT Security Comparison Landing Page
- (P2) EstateChatPage.js refactoring (2400+ lines)

## Key Technical Notes
- Housekeeping: `bash /app/housekeeping.sh` must pass 65/65 before every push
- State sync: Frontend media removals must explicitly call backend DELETE endpoints
- Narrative: Use "family preparedness" not "estate planning"
- MongoDB: Always exclude `_id` from responses
- First-visit intros use localStorage: `carryon_ccp_intro_seen`, `ect_security_seen`
- Financial Portal uses soft-delete (`deleted_at` field) on all records
- Custom categories stored in `bill_categories` collection, module-scoped (bills/debts/accounts)
