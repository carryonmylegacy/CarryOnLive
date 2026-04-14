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

### Completed (Apr 14, 2026 — Session 5: Chat Scroll & Menu Fix)
- **Action Menu Fixed Overlay**: Converted inline long-press action menu from in-flow rendering (caused content shifting) to a fixed-position overlay that floats over the messages. Menu includes emoji reactions, Reply, Copy, Edit, Pin, Delete, Send My Location. Position auto-adjusts: above bubble when in lower screen half, below when in upper half. Uses semi-transparent backdrop for dismiss. Zero document-flow impact.
- **Dead Space / Over-Scroll Fix**: Replaced `<div style={{ flex: 1 }} />` spacer with `minHeight: 100%; justify-content: flex-end` inner wrapper inside the scroll container. When few messages: content pins to bottom, no scrollable empty space. When many messages: normal scroll. Added `overscrollBehavior: contain` to prevent iOS rubber-band bounce past content edges.
- **Initial Scroll Position Fix**: Replaced `scrollIntoView` calls with direct `scrollTop = scrollHeight` on the scroll container. Triple-pass approach (requestAnimationFrame + 100ms + 350ms) ensures reliable scroll-to-bottom on channel open, message fetch, message send, and keyboard focus.
- **onTouchEnd Handler Fix**: Changed `onTouchEnd={onMsgTouchEnd}` to `onTouchEnd={(e) => onMsgTouchEnd(e, msg.id)}` so quick-tap emoji strip toggle receives the correct message ID.
- **iOS Text Selection Prevention**: Added `WebkitTouchCallout: 'none'` to message bubble styles alongside existing `WebkitUserSelect: 'none'`.
- **openMsgAction Scoping Fix**: Changed `document.querySelector` to `scrollContainerRef.current?.querySelector` to avoid finding hidden desktop-layout bubble duplicates that return zero-size rects.

### Completed (Apr 14, 2026 — Session 6: Touch Event Regression Fixes)
- **Bug Fix: Long-press menu disappearing on finger lift (iOS)**: Root cause: `onMsgTouchEnd` was resetting `msgLongPressTriggered.current = false` before iOS's synthetic `click` event fired, allowing `onClick` to call `closeMsgAction()`. Fix: keep flag alive in `onTouchEnd`, let `onClick` detect and reset it. Added 400ms timing guard on backdrop via `menuOpenedAtRef` to block synthetic clicks on the overlay.
- **Bug Fix: Reaction picker creating width gap on outgoing messages**: Root cause: the reaction picker used `position: relative` inside the message wrapper, expanding its width beyond the bubble text width. Fix: wrapped picker in `position: relative; height: 36px` container with the picker itself using `position: absolute` + right/left anchoring, preventing any width contribution to the parent.
- **Bug Fix: Tappable links in messages blocked by touch handlers**: Added `e.target.closest('a')` guard to both `onMsgTouchStart` and `onMsgTouchEnd` so taps on links (location, URLs) pass through to the browser's native handler.

### Completed (Apr 14, 2026 — Session 7: Emoji Library)
- **Full Emoji Library**: ~700 emojis across 8 categories (Smileys, Gestures, Animals & Nature, Food & Drink, Activities, Travel & Places, Objects, Hearts & Symbols). Component: `/components/estate-chat/EmojiLibrary.js`.
- **Emoji Picker Grid**: 6-column scrollable dropdown with sticky category headers and search-by-character. Opens from a SmilePlus icon button.
- **Recent Emojis Tracking**: Last 7 used emojis stored in localStorage (`ect_recent_emojis`). Defaults: 👍❤️😂😢🔥✅🙏.
- **Long-Press Menu Integration**: Emoji row shows 5 recent emojis + picker icon. When picker is open, action buttons (Reply/Copy/Edit/etc.) are hidden to save space.
- **Quick-Tap Strip Integration**: Tap-on-bubble reaction strip uses 5 recent emojis + picker icon + pin button.
- **Input Bar Integration**: Bottom quick-action strip shows all 7 recent emojis + SmilePlus picker (opens full catalog for draft input) + backspace button at far right. Removed redundant photo icon (duplicated paperclip).
- **Input Area Spacing Optimization**: Reduced vertical padding on input row and emoji strip. Removed 8px gap in visualViewport height calculations.
- **Backend: Open Emoji Reactions**: Removed `VALID_REACTIONS` whitelist. Backend now accepts any unicode emoji string ≤20 chars. Legacy keys (thumbs_up, heart, etc.) still work. 13 pytest tests verify the API.

## ==========================================
## ECT ACTION MENU — PERMANENT RECORD (April 14, 2026)
## ==========================================
## The action menu is rendered as a FIXED OVERLAY outside the scroll container.
## It is NOT inline in the message loop. This prevents ALL content shifting.
##
## Implementation:
##   - openMsgAction: captures bubble rect via scrollContainerRef.querySelector
##   - Stores { top, bottom, left, right, isOwn, showAbove } in menuPosition state
##   - Rendered at top level (alongside delete confirmation modals)
##   - Uses position: fixed with calculated top/bottom/left/right
##   - Semi-transparent backdrop catches dismiss clicks/touches
##   - closeMsgAction: resets both msgActionId and menuPosition to null
##
## DO NOT move the menu back inline in the message loop.
## DO NOT add paddingBottom hacks or scrollTop manipulation for menu positioning.

- **iOS Chat Input Cursor Fix**: Moved visible border from `<input>` to wrapper `<div>`, making input fully naked (`border: none; outline: none; background: transparent`). Eliminates iOS WebKit caret miscalculation inside `position: fixed` containers.
- **Safe-area bottom div**: Made unconditional (was gated by `inputFocused`). PRD mandates always-render.
- **Housekeeping 65/65**: Fixed route editor audit (#35 — updated check to include extracted `MessageCard.js`), Mongo projection safety (#38 — added `"id": 1` to `connected_protocol.py:784`), modal scroll safety (#55 — added `max-h-[90vh] overflow-y-auto` to ChecklistPage + VaultPage modals, `overflow-hidden` to VideoPlaybackModal). Updated check #55 to accept `overflow-hidden` for full-screen overlays.
- **Draft clearing fix**: Removed `inputRef.current?.focus()` after send (caused iOS keyboard buffer to restore text). Added `inputRef.current.value = ''` for direct DOM clear.
- **Scroll-to-bottom fix**: Double-pass scroll in fetchMessages (80ms + 300ms). Explicit scroll after send (250ms).
- **Input styling simplified**: No wrapper div, no border, no outline. Just `background: rgba(255,255,255,0.12)` + `box-shadow: 0 0 0 1.5px rgba(255,255,255,0.3)` on the input itself. This is the ONLY approach that keeps the cursor inside the box on iOS.

## ==========================================
## STABLE BASELINE — April 13, 2026 (Commit ~7cae4113)
## ==========================================
## USER CONFIRMED: Cursor in box, draft clears, messages scroll correctly.
## Input still appears slightly dim but functional. This is the safe return point.
##
## ECT CHAT INPUT — KNOWN WORKING CONFIGURATION:
##
##   <input> element (NO wrapper div):
##     background: rgba(255,255,255,0.12)
##     border: none
##     outline: none
##     boxShadow: 0 0 0 1.5px rgba(255,255,255,0.3)
##     color: #ffffff
##     fontSize: 16px
##     caretColor: #ffffff
##     className: w-full rounded-2xl px-4 py-2.5 text-base
##
##   Input bar container:
##     background: var(--bg2)
##     paddingBottom: 4px
##     borderTop: 1px solid var(--b)
##     position: relative
##     zIndex: 10
##     (NO transform, NO will-change)
##
##   Safe-area bottom div: UNCONDITIONAL render
##     background: var(--bg2)
##     height: env(safe-area-inset-bottom, 0px)
##
##   sendMessage(): NO inputRef.current.focus() after send.
##     Clear with setDraft('') + inputRef.current.value = ''
##
##   fetchMessages scroll: double-pass 80ms + 300ms
##   sendMessage scroll: explicit 250ms after fetch
##
##   onFocus: just setInputFocused(true), nothing else
##   onBlur: just setInputFocused(false), nothing else
##
## WHAT BREAKS THE CURSOR (DO NOT USE):
##   - border on <input> → cursor outside
##   - outline + outlineOffset on <input> → cursor outside
##   - Wrapper <div> with border around <input> → cursor outside
##   - Wrapper <div> with box-shadow: inset around <input> → cursor outside
##   - transform: translateZ(0) on input bar container → no effect on cursor
##   - JS blur/refocus hack → untested, overly complex
##   - Removing borderTop from input bar container → cursor outside
##   - Changing safe-area height when focused (44px) → cursor outside
##   - ANY layout dimension change on inputFocused → cursor outside
##
## WHAT WORKS:
##   - <textarea rows={1}> instead of <input> → cursor stays inside
##   - background color on textarea → fine (currently #345B80)
##   - No border, no outline on textarea → cursor stays inside
##   - borderTop on the INPUT BAR CONTAINER (not the textarea) → REQUIRED, removal breaks cursor
##   - Safe-area height: inputFocused ? '0px' : 'env(...)' → cursor stays inside
##   - enterKeyHint="send" → changes keyboard return key
##

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
##   - Use border or outline on the chat <input> element (causes cursor to render outside)
##   - Wrap the <input> in a div with border (same cursor bug)
##   - Use outline-offset on the <input> (same cursor bug)
##   - Add transform: translateZ(0) or will-change: transform to fix cursor (no effect)
##
## THE FIX IS: DO NOTHING. Let iOS handle it. Pure CSS. Zero JS.
## For the input: use box-shadow (not border/outline) for visual border effect.
