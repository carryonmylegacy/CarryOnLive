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

### Completed (Apr 12, 2026)
- **CarryOn Financial Portal (CFP)**: Complete new feature with 3 sub-modules (Bills, Debts, Accounts)
- **Dual Dashboard Gauges** (Estate Readiness + Financial Health)
- **Smart Bill Categorization** using xAI & Quick Add Bulk Import
- **Beneficiary Financial Page** with Bill Cancellation Advisor
- **Bill Reminder Scheduler** for post-transition push/in-app notifications
- **Platform-Wide Light Mode Audit & Fixes** (ECT, CCP, Vault, Privacy, Terms)
- **EstateChatPage.js Refactoring** (2516 → 2029 lines, 5 components extracted)

### Completed (Current Session — Apr 13, 2026)
- **iOS Font Compliance Fix**: Fixed 34 instances of sub-11px fonts (text-[10px]/text-[8px] → text-[11px]) across 11 financial component files. Housekeeping check #50 now PASS.
- **Backend: server.py Refactoring**: Extracted DB migrations and 97 index definitions into `db_indexes.py` (server.py: 434 → 262 lines, -40%)
- **Backend: guardian.py Refactoring**: Extracted 6 PDF export routes and `sanitize_for_pdf` helper into `routes/guardian_exports.py` (guardian.py: 1998 → 880 lines, -56%)
- **Backend: staff_tools.py Refactoring**: Extracted 13 ops/admin routes (activity, search, escalations, shift notes, knowledge base) into `routes/staff_ops.py` (staff_tools.py: 1850 → 1354 lines, -27%)
- **Frontend: ConnectedProtocolPage.js Refactoring**: Extracted Plan Editor + Active Emergency View + PlanDetails + ResourceLinker into `components/ccp/CCPPlanEditor.js` and `components/ccp/CCPActiveView.js` (ConnectedProtocolPage.js: 1157 → 695 lines, -40%)
- **Housekeeping Script Updated**: Checks #28 and #32 now scan `db_indexes.py` in addition to `server.py`
- **Testing**: All backend and frontend tests pass, housekeeping 65/65 ALL PASS, zero WARNs
- **DB Compound Indexes Added**: 7 new compound indexes for frequently-queried multi-field patterns (user_subscriptions, section_permissions, beneficiaries, family_plans, lifecycle_events, emergency_plans, messages). Total: 97 → 104.
- **Test Suite Cleanup**: Removed 3 superseded test files (test_username_auth.py, test_refactoring_rbac.py, test_refactoring_regression.py). Fixed 2 test files that crashed at collection time (test_2fa_and_sort.py, test_estate_rename.py). 110 → 107 files, 1543 tests collect cleanly.
- **Property & Assets Feature**: Expanded Financial Portal with 4th "Property" tab for real estate, vehicles, jewelry, artwork, businesses (LLCs, corporations), and other tangible assets. Full CRUD backend + frontend form with category-specific fields.
- **Financial Coverage Reframe**: Renamed "Financial Health" gauge to "Financial Coverage" — measures documentation completeness, not financial judgment. Labels: Not Started → Getting Started → Building → Thorough → Comprehensive.
- **Total Assets Expansion**: Summary now shows Total Assets = account balances + property values. Dashboard shows combined "Assets" count.
- **Testing**: All tests pass (iterations 54-56), housekeeping 65/65 ALL PASS
- **Dashboard Single Gauge**: Removed Financial Coverage gauge. Single Estate Readiness gauge now incorporates financials as a 4th scoring component (Messages + Checklist + Docs + Financials / 4). Added green "X% Financials" bubble alongside existing category bubbles.
- **Dashboard Layout Restructured**: Moved CFP guide tile above gauge (shows only when no financial data exists). Added Financial Portal StatCard (green) in the 4-card grid alongside Messages, IAC, SDV. Added Financial Portal summary preview tile at the bottom alongside Messages, Checklist, and Vault previews — shows monthly bills, total assets, and upcoming bills.

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
- (P3) Further EstateChatPage.js refactoring (input bar, message list extraction)
- (P3) Further ConnectedProtocolPage.js refactoring
- (P3) VaultPage.js refactoring (1746 lines)

## Refactoring Completed
- **EstateChatPage.js refactored** (Apr 12, 2026): 2516 → 2029 lines (~487 lines extracted)
  - `useVoiceRecorder.js`, `VoiceMessagePlayer.js`, `AuthMedia.js`, `ECTSecurityIntro.js`, `ImagePreviewModal.js`
- **Backend refactored** (Apr 13, 2026): 3 major files split
  - `server.py` → `db_indexes.py` (migrations + 97 indexes)
  - `guardian.py` → `guardian_exports.py` (6 PDF export routes + sanitize_for_pdf)
  - `staff_tools.py` → `staff_ops.py` (13 ops/admin routes)
- **ConnectedProtocolPage.js refactored** (Apr 13, 2026): 1157 → 695 lines (-40%)
  - `components/ccp/CCPPlanEditor.js` — plan editor form + ResourceLinker (257 lines)
  - `components/ccp/CCPActiveView.js` — active emergency dashboard + PlanDetails (278 lines)

## Code Architecture
```
/app
├── backend/
│   ├── db_indexes.py (NEW — migrations + 97 DB indexes)
│   ├── server.py (slimmed — app setup, lifespan, health, middleware)
│   ├── routes/
│   │   ├── guardian.py (core AI chat, session mgmt — 880 lines)
│   │   ├── guardian_exports.py (NEW — 6 PDF export routes — 1141 lines)
│   │   ├── staff_tools.py (admin integrations, announcements, xAI credits — 1354 lines)
│   │   ├── staff_ops.py (NEW — ops activity, search, escalations, shift notes, KB — 514 lines)
│   │   ├── financial_portal.py (CFP CRUD — 841 lines)
│   │   ├── auth.py (login, register, OTP, profile — 1783 lines)
│   │   └── ... (46 other route files)
│   ├── services/
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ccp/ (CCPPlanEditor, CCPActiveView — NEW)
│   │   │   ├── financial/ (BillTile, BillForm, BillCalendar, QuickAdd, etc.)
│   │   │   ├── estate-chat/ (AuthMedia, ECTSecurityIntro, ImagePreviewModal, etc.)
│   │   ├── pages/
│   │   │   ├── EstateChatPage.js (2029 lines)
│   │   │   ├── DashboardPage.js
│   │   │   ├── FinancialPortalPage.js
│   │   │   └── ...
│   │   ├── pages/beneficiary/
└── memory/
```

## Key Technical Notes
- Housekeeping: `bash /app/housekeeping.sh` must pass 65/65 before every push
- State sync: Frontend media removals must explicitly call backend DELETE endpoints
- Narrative: Use "family preparedness" not "estate planning"
- MongoDB: Always exclude `_id` from responses
- First-visit intros use localStorage: `carryon_ccp_intro_seen`, `ect_security_seen`
- Financial Portal uses soft-delete (`deleted_at` field) on all records
- Custom categories stored in `bill_categories` collection, module-scoped (bills/debts/accounts)
- **NEVER use hardcoded hex colors** for structural/text elements — use CSS variables
