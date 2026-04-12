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
- CarryOn Financial Picture (CFP) — bills, debts, accounts, property management

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

### Completed (Apr 12, 2026)
- **CarryOn Financial Picture (CFP)**: Complete feature with 4 sub-modules (Bills, Debts, Accounts, Property)
- **Dashboard Single Gauge** with Estate Readiness score incorporating Financials
- **Smart Bill Categorization** using xAI & Quick Add Bulk Import
- **Beneficiary Financial Page** with Bill Cancellation Advisor
- **Bill Reminder Scheduler** for post-transition push/in-app notifications
- **Platform-Wide Light Mode Audit & Fixes**
- **EstateChatPage.js Refactoring** (2516 to 2029 lines)

### Completed (Apr 13, 2026)
- iOS Font Compliance Fix (34 sub-11px fonts fixed)
- Backend Refactoring: Extracted db_indexes.py, guardian_exports.py, staff_ops.py
- Frontend Refactoring: Extracted CCPPlanEditor.js, CCPActiveView.js
- Property Assets CRUD (Real Estate, Vehicles, LLCs)
- Financial Coverage Reframe
- Dashboard Layout Restructured with single gauge + stat cards
- Renamed "Financial Portal" to "Financial Picture" everywhere user-facing
- Added CFP to admin feature gating registry
- DB Compound Indexes Added (7 new, total 104+)
- Test Suite Cleanup

### Completed (Apr 14, 2026)
- **Dashboard Gauge Layout Fix**: Moved 4 percentage labels to two flanking stacks (left: Messages + Checklist, right: Docs + Financials), gauge enlarged from w-36 to w-44 on mobile
- **Dashboard Gap Reduction**: Reduced header-to-content gap from mb-6 to mb-3
- **ECT Security Intro Centering**: Increased paddingBottom to 72px for better vertical centering in PWA standalone mode
- **Push Notification Resilience**: Fixed service worker registration to use direct registration instead of navigator.serviceWorker.ready (which could resolve to wrong SW). Added activation timeout handling and specific error messages for iOS edge cases
- **ECT Photo Loading Optimization**: Added inflight fetch deduplication to avoid redundant requests, added prefetchMedia() batch function with 3-concurrent fetching. Integrated into EstateChatPage to prefetch all media when conversation loads
- Housekeeping: 65/65 ALL PASS

## Blocked Items
- Apple IAP: Waiting on Paid Applications Agreement
- Twilio SMS: Waiting on A2P 10DLC campaign approval
- iOS Keyboard Ratchet in Chat: Pending user device verification

## Upcoming Tasks
- (P0) Fix user-identified bugs (awaiting user reports)
- (P0) Build CCP Tap-to-Create Wizard
- (P0) Google Play Store Launch
- (P1) Share Extension Setup (iOS)
- (P1) iOS Live Updates (Capgo)

## Future/Backlog
- (P2) CFP Getting Started Integration — Add CFP step to onboarding wizard
- (P2) Readiness Scoring Policy Page
- (P3) ECT Security Comparison Landing Page
- (P3) Further EstateChatPage.js refactoring (input bar, message list extraction)
- (P3) VaultPage.js refactoring (1746 lines)
- (P3) MessagesPage.js refactoring (~1500 lines)

## Code Architecture
```
/app
├── backend/
│   ├── db_indexes.py (migrations + 104+ DB indexes)
│   ├── server.py (app setup, lifespan, health, middleware)
│   ├── routes/
│   │   ├── guardian.py (core AI chat, session mgmt)
│   │   ├── guardian_exports.py (6 PDF export routes)
│   │   ├── staff_tools.py (admin integrations, announcements)
│   │   ├── staff_ops.py (ops activity, search, escalations)
│   │   ├── financial_portal.py (CFP CRUD)
│   │   ├── auth.py (login, register, OTP, profile)
│   │   ├── push.py (push notification subscription)
│   │   └── ... (46 other route files)
│   ├── services/
│   │   └── readiness.py (unified Estate Readiness algorithm)
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ccp/ (CCPPlanEditor, CCPActiveView)
│   │   │   ├── financial/ (BillTile, BillForm, PropertyAssetForm, etc.)
│   │   │   ├── estate-chat/ (AuthMedia, ECTSecurityIntro, ImagePreviewModal, etc.)
│   │   │   ├── PushPrompt.js (push notification prompt)
│   │   │   ├── NotificationSettings.js (push toggle in settings)
│   │   ├── pages/
│   │   │   ├── DashboardPage.js (gauge with flanking percentages)
│   │   │   ├── EstateChatPage.js (2030 lines)
│   │   │   ├── FinancialPortalPage.js
│   │   │   └── ...
│   │   ├── pages/beneficiary/
│   └── public/
│       └── sw-push.js (push notification service worker)
└── memory/
```

## Key Technical Notes
- Housekeeping: `bash /app/housekeeping.sh` must pass 65/65 before every push
- State sync: Frontend media removals must explicitly call backend DELETE endpoints
- Narrative: Use "family preparedness" not "estate planning"
- MongoDB: Always exclude `_id` from responses
- First-visit intros use localStorage: `carryon_ccp_intro_seen`, `ect_security_seen`
- Financial Picture uses soft-delete (`deleted_at` field) on all records
- Custom categories stored in `bill_categories` collection, module-scoped
- **NEVER use hardcoded hex colors** for structural/text elements — use CSS variables
- Financial module is internally `financial_portal` / `cfp`, but user-facing name is "Financial Picture"
- Feature gating uses `isFeatureKeyEnabled(key, enabledFeatures)` on frontend
- During trial period, all features default to enabled
