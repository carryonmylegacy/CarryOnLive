# CarryOn - Family Preparedness Platform

## Original Problem Statement
Build and maintain a comprehensive family preparedness platform that helps users organize their estate plans, secure important documents, and leave messages for beneficiaries.

## CRITICAL: Estate Chat Message Ordering — PERMANENT RECORD (April 2026)
**DO NOT** add `[::-1]` or any extra reversal to the return statement in `get_messages()`.
The backend flow is: `sort("created_at", -1).limit(50)` → `.reverse()` → return as-is.
This produces chronological order (oldest first, newest last) for the frontend.

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

## Refactoring History

### April 13, 2026 — Frontend Component Extraction
Extracted sub-components from three monolithic page files:
- **VaultPage.js**: 1747 → 1021 lines (-42%). Extracted: VaultDocumentCard, VaultUploadPanel, VaultUnlockModal, VaultEditPanel, VaultLockModals (SetLock, RemoveLock, BackupCode)
- **MessagesPage.js**: 1665 → 1413 lines (-15%). Extracted: VideoPlaybackModal, MessageCard, VideoRecordingOverlay
- **EstateChatPage.js**: 1944 → 1838 lines (-5%). Extracted: NewChatModal
- New component dirs: `/components/vault/`, `/components/messages/`, `/components/chat/`
- Zero logic/CSS changes. All extractions are pure prop-passthrough.

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
- **Family Readiness Report PDF**: Comprehensive downloadable PDF combining estate readiness score (with pillar breakdown), emergency plan coverage (all plans with details + drill schedules), and drill performance history (with debrief ratings and notes). Designed to be printed and kept in a family's go-bag.
  - Backend: family_readiness_report download action via /api/downloads/prepare → /api/downloads/{token}
  - Frontend: "Family Readiness Report" button on CCP home page (visible when user has plans)
- **Enhanced CCP Plan PDF**: Individual plan PDFs now include a "Drill Schedule" section showing frequency, schedule label, and next drill date when drill reminders are enabled.
- **Share Plan (Public Link)**: Family members can share emergency plans via a simple link — recipients view the full plan on a clean, mobile-friendly page without needing a CarryOn account. Features include token generation, copy-to-clipboard, native share (Web Share API), and link revocation.
  - Backend: POST /api/ccp/plans/{plan_id}/share — generate share token; DELETE to revoke
  - Backend: GET /api/public/ccp/{share_token} — public endpoint (no auth) serves plan data
  - Frontend: SharedPlanPage.js at /shared/plan/:token — dark-themed public page with all plan sections
  - Frontend: Share button on plan cards + share modal with copy link, native share, and revoke
- **Emergency Contact Card**: Wallet-sized printable PDF (business card format, 4 per A4 page) with QR code linking to the shared plan, plan name, primary meeting point, communication plan summary, and CarryOn branding. Auto-generates share token if plan doesn't have one. Cut lines included for easy printing.
  - Backend: emergency_card download action via /api/downloads/prepare → /api/downloads/{token}
  - Uses qrcode[pil] library for QR code generation
  - Frontend: "Emergency Card (wallet PDF + QR)" button on plan cards
- **iOS Keyboard Ratcheting FIX (RESOLVED after 10+ iterations)**: Removed ALL JavaScript keyboard/viewport manipulation from ECT chat. The root element uses pure CSS `position: fixed; inset: 0; overflow: hidden` — iOS naturally shrinks the viewport when the keyboard opens, and the flex layout adapts. See CRITICAL section at bottom of this file for full post-mortem.
- **Theme & Responsive Audit**: Replaced all `rgba(255,255,255,X)` with theme-aware CSS variables across CCPWizard, CCPDebriefView, CCPPlanEditor, CCPActiveView, ConnectedProtocolPage (48 instances total). All CCP components now work correctly in both light and dark modes.
- **SDV Action Buttons Fix**: Fixed missing Lock/Edit/Delete buttons for admin users with benefactor privileges. Changed `user?.role === 'benefactor'` to `(user?.role === 'benefactor' || user?.is_also_benefactor)` in VaultPage and MessagesPage.
- **SDV Touch Device Fix**: Removed `sm:opacity-0 sm:group-hover:opacity-100` from document action buttons — hover-to-reveal doesn't work on touch devices (iPad, iPhone).
- **Beneficiaries Tile Responsive Fix**: Added `lg:col-span-full` to Dashboard Beneficiaries StatCard so it spans full width when wrapping to second row at iPad/tablet widths.
- **CCP Walkthrough Recall**: Added "How CCP Works" button on CCP home to re-open the instructional walkthrough.
- **CCP Walkthrough Button Uniformity**: Fixed walkthrough action buttons wrapping to two lines on PWA — `text-sm` + `whitespace-nowrap`.
- **Frontend Caching Fix**: Added `no-cache` headers for `index.html` in nginx.conf. Added `--extra-index-url` for emergentintegrations in requirements.txt.
- **Refactoring**: Removed unused imports, added MongoDB indexes (share_token sparse, compound activation index), all ruff/eslint clean, housekeeping 63/65 PASS.

### Completed (Apr 13, 2026 — Session 4)
- **iOS Chat Input Cursor Fix**: Moved visible border from `<input>` to wrapper `<div>`, making input fully naked (`border: none; outline: none; background: transparent`). Eliminates iOS WebKit caret miscalculation inside `position: fixed` containers.
- **Safe-area bottom div**: Made unconditional (was gated by `inputFocused`). PRD mandates always-render.
- **Housekeeping 65/65**: Fixed route editor audit (#35 — updated check to include extracted `MessageCard.js`), Mongo projection safety (#38 — added `"id": 1` to `connected_protocol.py:784`), modal scroll safety (#55 — added `max-h-[90vh] overflow-y-auto` to ChecklistPage + VaultPage modals, `overflow-hidden` to VideoPlaybackModal). Updated check #55 to accept `overflow-hidden` for full-screen overlays.

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

## ==========================================
## CRITICAL: iOS PWA Keyboard Fix — PERMANENT RECORD
## ==========================================
## Cost: ~$2,000+ in tokens across 10+ iterations over 2 weeks.
## This section exists so NO future agent EVER breaks this fix.
##
## THE SOLUTION (V10 — the ONLY version that works):
##
##   The ECT chat root element (`#ect-root`) uses:
##     position: fixed; top: 0; left: 0; right: 0; bottom: 0;
##     overflow: hidden;
##
##   With ZERO JavaScript viewport/keyboard manipulation.
##   No visualViewport listeners. No paddingBottom. No height overrides.
##   No window.scrollTo. No body position locking. No transform.
##   NOTHING. Just pure CSS position:fixed with inset:0.
##
##   iOS Safari/PWA naturally shrinks the viewport when the keyboard opens.
##   The fixed root shrinks with it. The flex layout adapts automatically:
##   header stays at top, messages scroll in middle, input at bottom above keyboard.
##
## WHY EVERY OTHER APPROACH FAILED:
##
##   1. paddingBottom approach: visualViewport.resize fires multiple times during
##      keyboard animation → paddingBottom changes rapidly → visible ratcheting/jitter.
##
##   2. body.position='fixed' on keyboard open: immediate visual jump as body
##      layout changes. Combined with paddingBottom = double jitter.
##
##   3. window.scrollTo(0,0) on input focus: fights with iOS's own scroll
##      behavior → bouncing/fighting animation.
##
##   4. root.style.height = vv.height: iOS Safari changes BOTH window.innerHeight
##      AND visualViewport.height together when keyboard opens (both shrink from
##      746→399). So innerHeight - vv.height = 0 ALWAYS. Keyboard height
##      calculation fails completely.
##
##   5. Capturing initial height via useRef then using it: root extends behind
##      keyboard at 746px while viewport is 399px → iOS scrolls the page to
##      bring input into view → content jumps to top of screen then slowly
##      drifts back down as scrollTo(0,0) fights iOS scroll.
##
##   6. root.style.top = vv.offsetTop: in iOS Safari, fixed elements are relative
##      to the layout viewport. Setting top to offsetTop shifts the element DOWN,
##      but combined with height=vv.height the layout becomes wrong.
##
## DEPLOYMENT GOTCHA (cost hours of debugging):
##
##   The frontend deploys to VERCEL (not Railway). Railway only builds the backend.
##   The nginx.conf in /app/frontend/ is NOT used by Vercel — it's for the Docker
##   deployment path only. Vercel uses vercel.json.
##
##   When testing iOS keyboard changes, the index.html must NOT be cached.
##   If changes appear to not deploy, the issue is browser/PWA cache, not code.
##   The vercel.json ignoreCommand is correct and works.
##
##   To verify code is deployed: add a VISIBLE, UNCONDITIONAL debug element
##   (like a colored banner with version number) that renders WITHOUT any
##   conditional logic. If the banner doesn't appear, the code isn't deployed.
##
## SAFE-AREA BOTTOM SPACER:
##   The safe-area-inset-bottom div MUST render unconditionally (not gated by
##   inputFocused state). Previously it was {!inputFocused && <div>} which
##   caused a transparent gap when keyboard was open. Now it always renders
##   with background: var(--bg2).
##
## INPUT BAR DEFINITION:
##   The input bar wrapper uses borderTop: '1px solid var(--b)' for crisp
##   visual separation from the message area. Without this, the transition
##   from messages to input bar looks "faded" or undefined.
##
## DO NOT:
##   - Add ANY JavaScript that modifies #ect-root styles (height, top, bottom,
##     transform, paddingBottom) in response to keyboard/viewport events
##   - Add visualViewport event listeners for keyboard compensation
##   - Add window.scrollTo calls on input focus
##   - Lock body scroll (position:fixed on body) when keyboard opens
##   - Make the safe-area-inset-bottom spacer conditional on inputFocused
##   - Use window.innerHeight to calculate keyboard height (it equals vv.height on iOS)
##
## THE FIX IS: DO NOTHING. Let iOS handle it. Pure CSS. Zero JS.
