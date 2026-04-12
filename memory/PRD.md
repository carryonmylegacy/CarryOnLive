# CarryOn - Family Preparedness Platform

## Original Problem Statement
Build and maintain a comprehensive family preparedness platform that helps users organize their estate plans, secure important documents, and leave messages for beneficiaries.

## Core Requirements
- Secure document vault with AES-256 encryption
- Milestone messaging (written, voice, video, attachment)
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
- Getting Started UX Overhaul
- CCP First-Visit Welcome Walkthrough
- ECT Enhanced Security Intro
- All prior platform-wide fixes

### Completed (Apr 12-13, 2026)
- CarryOn Financial Picture (CFP) with 4 sub-modules (Bills, Debts, Accounts, Property)
- Dashboard single gauge with Estate Readiness incorporating Financials
- Smart Bill Categorization using xAI
- Backend/Frontend Refactoring (server.py, guardian.py, staff_tools.py, ConnectedProtocolPage.js)
- iOS Font Compliance (34 sub-11px fonts fixed)
- Property Assets CRUD
- Feature gating for CFP

### Completed (Apr 14, 2026 — Session 1)
- Dashboard gauge percentage labels moved to flanking stacks
- Dashboard gap reduction (mb-6 → mb-3)
- ECT Security Intro vertical centering improved
- Push notification service worker registration hardened
- ECT photo prefetching with batch deduplication

### Completed (Apr 14, 2026 — Session 2)
- **Dashboard Gauge Layout v3**: Complete restructure — title at top, percentages in upper left/right corners, gauge centered below with score in normal flow (no absolute positioning/overflow). Zero overlap.
- **MM Attachment Type**: 4th Milestone Message type — users can now upload documents and photos (handwritten notes, scans, etc.) as standalone message attachments. Full backend encryption + storage via S3. Backend endpoints: POST /api/messages/{id}/upload-attachment, GET /api/messages/{id}/attachment
- **IAC Quick Templates Removed**: Removed Quick Start Templates button, dropdown, QUICK_TEMPLATES array, and applyTemplate function from ChecklistPage. Cleaned up unused imports.
- **CCP Beneficiary Visibility Note**: Added "Your beneficiaries can view these plans on their portal." note on Emergency Plans page for benefactors with plans.

### Completed (Apr 14, 2026 — Session 3)
- **CCP Tap-to-Create Wizard**: AI-powered emergency plan generator. Users answer 4 tap-based questions (Location, Household, Concerns, Preference) and xAI generates a complete plan with meeting points, communication plan, resource locations, step-by-step instructions, and risk warnings. Users can Accept or Change each section before saving.
  - Backend: POST /api/ccp/wizard/generate — validates inputs, calls xAI with structured prompt, returns complete plan JSON
  - Frontend: CCPWizard.js component with 5-step flow (4 questions + review)
  - 17 emergency scenarios supported (hurricane, tornado, earthquake, flood, wildfire, nuclear, etc.)
  - 4 household considerations (children, elderly, pets, special needs)
  - Auto-detect location via browser geolocation + Google Geocoding
  - "Build My Plan" button prominently placed on CCP home and plans list pages
  - Manual plan creation (+ button) still accessible as secondary option
- **AI-Suggested Drill Schedules with Email Reminders**: Each wizard-generated plan includes a recommended drill frequency based on the scenario type (e.g., hurricane → biannual May/Nov, house fire → quarterly). Users can enable/disable reminders per plan.
  - Backend: PATCH /api/ccp/plans/{plan_id}/drill-schedule — toggle drill reminders on/off
  - Backend: drill_reminder_scheduler — daily background task sends CarryOn-branded emails on the 1st of recommended months
  - Email: Warm, guiding tone with step-by-step drill instructions, branded in CarryOn dark theme (#0F1629 bg, #d4af37 gold)
  - Frontend: Drill schedule section in wizard review with toggle
  - Frontend: Drill schedule info + toggle on plan cards in plans list
  - 17 concern-to-schedule mappings with smart next-drill-date computation
- **Post-Drill Debrief**: After deactivating a drill, prompts the family to rate the experience (1-5 stars) and leave notes on what went well and what to improve. History view shows debrief data on past drill cards with star ratings. Includes a "Drill Performance" trend summary card with average rating and mini bar chart showing improvement over time.
  - Backend: POST /api/ccp/debrief/{activation_id} — submit debrief (rating 1-5, went_well, to_improve)
  - Backend: GET /api/ccp/debrief-stats/{estate_id} — aggregated trend data (entries, total_drills, average_rating)
  - Frontend: CCPDebriefView.js — debrief component with interactive star rating, two notes fields, success animation
  - Frontend: Enhanced history view with debrief info on drill cards, "Add Debrief" button for past drills without one, and trend summary card with mini bar chart

## Blocked Items
- Apple IAP: Waiting on Paid Applications Agreement
- Twilio SMS: Waiting on A2P 10DLC campaign approval
- iOS Keyboard Ratchet in Chat: Pending user device verification

## Upcoming Tasks
- (P0) Google Play Store Launch
- (P1) Share Extension Setup (iOS)
- (P1) iOS Live Updates (Capgo)

## Future/Backlog
- (P2) CFP Getting Started Integration — Add CFP step to onboarding wizard
- (P2) Readiness Scoring Policy Page
- (P2) IAC + CFP deep integration (bills become checklist items for beneficiaries)
- (P3) ECT Security Comparison Landing Page
- (P3) Further EstateChatPage.js refactoring
- (P3) VaultPage.js refactoring (1746 lines)
- (P3) MessagesPage.js refactoring (~1600 lines)

## Key Technical Notes
- Housekeeping: `bash /app/housekeeping.sh` must pass 65/65 before every push
- MongoDB: Always exclude `_id` from responses
- Financial module is internally `financial_portal` / `cfp`, user-facing name is "Financial Picture"
- Feature gating uses `isFeatureKeyEnabled(key, enabledFeatures)` on frontend
- During trial period, all features default to enabled
- Message types: text, voice, video, attachment
- Attachment messages: file encrypted with AES-256-GCM, stored in S3 via same encryption pipeline as video/voice
- CCP Wizard uses xAI (Grok) with JSON response format for structured plan generation
- Wizard concern-to-plan-type mapping in `_CONCERN_TO_PLAN_TYPE` dict in connected_protocol.py
