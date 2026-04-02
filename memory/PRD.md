# CarryOn - Estate Planning Application

## ZERO TOLERANCE: Perfect Code Every Push
**This is the #1 rule of this project. No exceptions. No excuses.**
Every push to GitHub must be production-perfect. No artifacts, no hanging chads, no "it's just a small thing." Fix everything proactively — dirty git diffs, stale files, unused imports, console.logs, TODO comments, version drift, lock file noise — before declaring anything ready to push. The agent must catch and resolve ALL of these without being told. This project did not get here by accepting little bullshit things along the way. The standard is perfection. Every. Single. Time.

**MANDATORY: Before EVERY push, run `bash /app/housekeeping.sh` — the 60-check CarryOn Housekeeping Protocol + SOC 2 Compliance Audit. ALL 60 checks must PASS. Do NOT tell the user "ready to push" without running this script first. No exceptions. Ever.**

## Original Problem Statement
A full-stack estate planning application allowing benefactors to manage digital estates, beneficiaries, documents, and messages. Features role-based access (admin, benefactor, beneficiary), invitation system, orbit visualization for family connections, and Stripe/IAP subscriptions.

## Core Architecture
- **Frontend**: React (CRA) + Shadcn/UI + TailwindCSS + Capacitor (iOS/Android)
- **Backend**: FastAPI + MongoDB (motor async)
- **Auth**: JWT-based with optional OTP, supports login via username or email
- **Storage**: AWS S3 for documents AND photos (presigned URLs)
- **Integrations**: xAI (Grok), Stripe, Apple IAP, AWS S3, Resend, Google Places, Capgo, CodeMagic, Railway, Vercel
- **Admin Routes**: Modular `routes/admin/` package (users, analytics, security_scan, estate_health, platform, grace_periods, dev_switcher, scoped_roles, ip_whitelist, bulk_ops, canned_responses, maintenance, task_management)
- **Guards**: `guards.py` exports `require_admin`, `require_staff`, `require_benefactor_role`, `require_admin_scope`, `get_current_user` for DRY access control

## CRITICAL: Beta Access Model
**There is NO global `beta_mode` toggle.** Beta access is controlled per-user via the `is_beta_tester` flag on individual benefactor and beneficiary accounts. Each user gets a beta tile at initial login as part of the onboarding workflow. The global `beta_mode` field in `subscription_settings` is legacy/deprecated — do NOT add new code that checks it. Always use the per-user `is_beta_tester` flag for beta-related logic.

## CRITICAL: User Deployment & Testing Workflow
**The user ALWAYS pushes to GitHub, deploys through Railway (backend) and Vercel (frontend), and tests EXCLUSIVELY on their production site (carryon.us) via iOS/PWA. NEVER suggest "check the preview URL" or "push to GitHub to see changes" — they already do this every time. All code changes MUST work in production deployment. Do not reference the preview environment when discussing what the user sees.**

## Key Data Models
- **users**: email, password, username, username_lower, role, is_also_benefactor, is_also_beneficiary, photo_url (S3 key), otp_enabled (default: true)
- **estates**: owner_id, beneficiaries[], name, name_customized
- **beneficiaries**: estate_id, user_id, email, photo_url (S3 key), invitation_status, is_primary
- **ega_tasks**: estate_id, type, status (running/completed/error), items_added, duplicates_skipped, duplicate_titles, started_at, completed_at
- **family_plans**: fpo_user_id, members[], $1/mo benefactor discount, $3.49 flat beneficiary rate
- **digest_preferences**: user_id, frequency, content toggles, additional recipients
- **platform_settings**: _id="global", otp_disabled (master switch)
- **subscription_settings**: _id="global", feature_gates (per-feature per-tier boolean map), feature_gates_published_at, feature_gates_published_by

## What's Been Implemented

### Completed (April 2, 2026 — SDV + ECT UX Overhaul)

**SDV Beneficiary Selector Redesign**
- Replaced bland checkbox list with polished avatar-button cards for each beneficiary
- Each card shows profile photo (or initials), name, and relation with highlight on selection
- Added Pre-Transition / Post-Transition visibility toggles per beneficiary
- Backend: `PUT /api/documents/{doc_id}/designate-beneficiaries` now accepts `visibility_timing` dict ({ben_id: {pre: bool, post: bool}})
- Backend: New `GET /api/documents/{estate_id}/pre-transition` endpoint returns docs visible to a beneficiary pre-transition (emergency docs + docs with pre=true in visibility_timing)
- "Select All" card with Users icon and gold highlight

**ECT Full-Screen Overhaul**
- ECT now renders as full-screen overlay (position:fixed, z-index:45) covering the entire viewport
- Bottom navigation bar hidden when ECT is active (via body.ect-active CSS class)
- Back arrow in ECT header navigates to previous page
- iMessage Liquid Glass-style input bar: backdrop-blur(20px), elevated shadow, sits at bottom with safe-area padding
- Correct height calculation — no more clipped headers or wasted space
- All modals (new chat, security intro) work within the full-screen layout

**Voice Message Recording**
- Microphone button in ECT input bar (replaces send button when input is empty)
- Tap to start recording — shows recording indicator with duration timer, cancel button
- Tap send to stop recording and send as voice message
- Backend: ALLOWED_FILE_TYPES expanded to include audio/webm, audio/ogg, audio/mp4, audio/mpeg, audio/wav, audio/x-m4a, video/webm
- Backend: message_type "voice" detected for audio uploads
- Inline VoiceMessagePlayer component with play/pause, progress bar, duration display

**ECT Attachment Auth Fix**
- Images and files in ECT now load via authenticated fetch() with blob URLs
- AuthImage component: fetches image with Bearer token, renders blob URL
- AuthFileLink component: authenticated download via fetch + createObjectURL
- No more "Not authenticated" error when clicking attachments

**Beneficiary Pre-Transition Document Access**
- PreTransitionPage shows "View Additional Documents" button when benefactor has shared pre-transition docs
- BeneficiaryVaultPage uses new `/api/documents/{estateId}/pre-transition` endpoint
- Pre-transition docs include emergency categories (POA, Living Will) + any doc with visibility_timing.pre=true

**Font Size & Accessibility**
- Minimum font size CSS enforcement for mobile: font-size: max(12px, inherit)
- PRD rule: No interactive/content font below 12px for 40+ demographic
- Permissions-Policy updated to allow camera=(self) and microphone=(self)

### Completed (April 1, 2026 — Logo Refinement)
- Logo `carryon-logo.png` pixel-perfected: cleared "a" bowl transparency, removed stray dots, applied color decontamination to dark fringes

### Completed (April 1, 2026 — CCP Phase 2 + FFN Chat Integration)

**CCP Phase 2: Linked SDV/FFN/DAV Access from Active Emergency**
- New `GET /api/ccp/active/{estate_id}/linked-resources` endpoint resolves linked document, FFN contact, and DAV entry IDs into full details
- Active emergency view now shows "EMERGENCY RESOURCES" section with three color-coded cards:
  - Documents (SDV) — blue, with links to vault
  - Trusted Contacts (FFN) — green, with tap-to-call and tap-to-email buttons
  - Digital Credentials (DAV) — purple, with links to digital wallet
- Plan editor now includes `ResourceLinker` component for each resource type (SDV/FFN/DAV) with checkbox-based selection
- Resources are snapshotted at activation time and displayed during the emergency

**FFN Integration into Estate Chat**
- FFN contacts now appear in ECT member picker with orange "EXTERNAL" badge
- Any estate member can include FFN contacts in group chats or DMs
- Messages to channels containing FFN contacts are delivered via email (Resend) and SMS (Twilio)
- Emails include estate name, sender name, other participants, and CarryOn branding
- SMS includes estate name and sender with 140-char message preview
- Security intro glass panel on first ECT use explaining closed-network privacy model
- Collapsible "Why ECT is different" info section in channel list with 5 privacy points

### Completed (April 1, 2026 — Estate Communication Tool + Contingency Protocols)

**Estate Communication Tool (ECT)**
- New `routes/estate_chat.py` with 8 endpoints for secure estate member messaging
- Three channel types: Circle (auto-created per estate), Group (benefactor-created), Direct (1:1)
- `GET /api/estate-chat/contacts` — returns all connected members across estates, grouped by estate
- `GET /api/estate-chat/channels` — lists all channels user belongs to with unread counts and previews
- `POST /api/estate-chat/channels` — create group or direct message channels with estate membership validation
- `GET/POST /api/estate-chat/channels/{id}/messages` — read/send messages with 2000 char limit
- `PUT /api/estate-chat/channels/{id}/members` — update group members (benefactor only)
- `DELETE /api/estate-chat/channels/{id}` — delete group channels (benefactor only, cannot delete circles/DMs)
- `GET /api/estate-chat/unread-total` — total unread count for badge display
- Frontend: `EstateChatPage.js` with split-panel layout (channel list + message area), member picker modal, polling
- DB collections: `estate_channels`, `estate_messages`, `estate_channel_reads` with performance indexes
- Added to both benefactor and beneficiary sidebar/mobile nav as "Estate Comms (ECT)"
- Test report: `iteration_39.json` — 26/26 tests passed (100%)

**CarryOn Contingency Protocols (CCP)**
- New `routes/connected_protocol.py` with 9 endpoints for family disaster planning
- Emergency Plans CRUD: Create, read, update, soft-delete plans with types (natural_disaster, national_emergency, medical_emergency, infrastructure_failure, custom)
- Plan Builder: Rendezvous points (name + address), communication plan, resource/supply locations, instructions
- Plan Activation: One-tap activation with drill mode support. Prevents duplicate active emergencies per estate
- Real-time Status Board: Shows all estate members with check-in status (Safe, Evacuating, At Rendezvous, Need Help, Sheltering, Other, Not Checked In)
- Member Check-In: Status selection with optional notes and location description
- Drill Feature: Practice runs clearly marked as drills
- Deactivation: Generates summary report with all check-in history
- Activation History: View past emergencies and drills
- Frontend: `ConnectedProtocolPage.js` with crisis-friendly big bubble buttons (80px+ touch targets), color-coded status indicators
- DB collections: `emergency_plans`, `emergency_activations`, `member_checkins` with indexes
- Added to both benefactor and beneficiary sidebar/mobile nav as "Contingency Protocols (CCP)"
- iOS compliance: All font sizes >= 12px (40+ demographic — glasses!), proper touch targets
- Housekeeping: 60/60 PASS, Ruff clean

**Push Notifications + Notification Preferences**
- New `routes/notification_prefs.py` — Per-user notification preferences with admin-managed categories
- 5 default categories auto-seeded: Emergency Alerts (CCP) [CRITICAL], Estate Comms (ECT), Estate Updates, Milestone Messages, System
- All toggles ON by default; master on/off toggle to disable all notifications
- `GET /api/notification-prefs` — returns user prefs + available categories, auto-creates if missing
- `PUT /api/notification-prefs` — update master toggle and/or individual category toggles
- Admin CRUD: `GET/POST/PUT/DELETE /api/admin/notification-categories` — Founder can add, edit, reorder, or remove categories
- New categories added by admin automatically appear in all users' Settings with configured defaults
- CCP push integration: activate sends to all members, deactivate sends to all members, check-in sends to benefactor
- All push calls respect user preferences via `should_notify()` helper
- Frontend: `NotificationPrefsCard.js` added to both benefactor and beneficiary Settings pages
- Frontend: `NotificationCategoriesTab.js` added to Admin → Admin section as "Notifications" tab
- Test report: `iteration_40.json` — 20/20 tests passed (100%)

### Completed (April 1, 2026 — Unified Admin Accounts + Ops Scopes + Section Members)

**Unified Admin Account Management**
- Added `ops_manager` and `ops_team` as valid admin scopes in `VALID_SCOPES` and `SCOPE_LABELS`
- Admin Accounts tab (ScopedAdminsTab) now includes checkboxes for Operations Manager and Operations Team Member
- The create endpoint now MERGES scopes when email already exists (instead of rejecting with 400 "Email already in use")
- Operators are automatically upgraded to admin role when scopes are assigned via the Admin Accounts tab
- The scoped admins list now returns BOTH admin and operator accounts for unified management
- Operators without explicit `admin_scope` get scope derived from `operator_role` (manager→ops_manager, worker→ops_team)
- Email field accepts both emails and usernames (changed from EmailStr to str) to support operator usernames
- OPERATOR badge displayed on operator-role users in the admin list

**Section Members Tabs**
- Added "Members" tab to each portal section: Operations, Finance, Marketing, Compliance, Platform
- New `SectionMembersTab` component shows all users with access to a specific section
- Founder users appear in all section member views (they have universal access)
- Scope badges highlight which scopes are active for the current section

**Bug Fix: normalize_scopes Default**
- Fixed `normalize_scopes()` defaulting to `["founder"]` for operators without explicit admin_scope
- Applied consistent scope derivation logic across CREATE, UPDATE, and DELETE endpoints
- Test report: `iteration_35.json` — 16/16 tests passed (100%)

### Completed (April 1, 2026 — Milestone Downloads + IAC Export + SDV Beneficiary Designation)

**Milestone Message Downloads**
- New `GET /api/messages/{id}/download` endpoint
- Text messages → generates PDF with title, date, content (minimal PDF builder, no dependencies)
- Video messages → redirects to existing video blob endpoint for direct download
- Voice messages → redirects to existing voice blob endpoint for direct download
- Download button (green) added to each message card in MessagesPage.js
- Available to both benefactors (alongside Edit/Delete) and beneficiaries (standalone)

**IAC Download for Beneficiaries**
- New `POST /api/guardian/beneficiary-export-checklist` endpoint
- Finds estate via beneficiaries array (not owner_id)
- Generates formatted PDF checklist with categories, checkmarks, readiness score
- Includes disclaimer, estate name, benefactor name, state
- Download IAC button added to BeneficiaryGuardianPage.js

**SDV Beneficiary Designation**
- New `PUT /api/documents/{id}/designate-beneficiaries` endpoint
- Accepts `{ beneficiary_ids: ["all"], visibility_timing: {ben_id: {pre: bool, post: bool}} }` (default: post-only)
- `designated_beneficiaries` and `visibility_timing` fields stored on each document
- Avatar-button card UI on each vault tile with profile photos/initials
- Shows "Select All" + individual beneficiary cards with Pre/Post-Transition toggles
- "All beneficiaries" vs "X of Y beneficiaries" summary label
- Beneficiary list fetched alongside documents on VaultPage load
- Test report: `iteration_38.json` — 11/11 passed (100%), `iteration_42.json` — 100% passed



### Completed (April 1, 2026 — Portal Buttons + Truncated Founder View Fix)

**Admin Portal Buttons (above Sign Out)**
- Added stacked portal buttons in the sidebar under "SWITCH PORTAL" label for admin users
- Each authorized scope maps to a clickable portal button: Founder, Operations, Finance, Compliance, Marketing, Platform
- `ops_manager` and `ops_team` merged into single "Operations Portal" button (using `altScope` config)
- Clicking a portal button switches the tab bar to show only that section's tabs
- Clicking "Founder Portal" restores the full view with all sections
- Same buttons added to MobileNav slide-out menu for mobile parity
- Buttons styled consistently with existing benefactor/beneficiary portal pills

**Bug Fix: Truncated Founder Page on Login**
- Root cause: `admin_scope` comparisons used string equality (`!== 'founder'`, `=== sp.scope`) while the API now returns arrays `['founder']`
- Fixed with `scopeArr()` and `hasScope()` helpers that properly normalize admin_scope to arrays
- `handleScopePreview` and `handleRestoreFounder` now set admin_scope as arrays (`[scope]`) instead of strings
- AuthContext `login()` now clears `dev_switcher_active_role` to prevent stale PWA state
- Operations section in AdminPage now includes `ops_manager`/`ops_team` in its scopes array
- All fixes applied to BOTH `Sidebar.js` and `MobileNav.js`
- Test report: `iteration_36.json` — 10/10 frontend tests passed (100%)





### Completed (March 31, 2026 — Pressure Test + DRY Refactor)

**Full Platform Pressure Test**
- Comprehensive testing of ALL 37 Founder admin tabs and 47 backend API endpoints
- 100% pass rate: every tab renders, every endpoint returns valid JSON
- Zero blank screens, zero crashes, zero critical console errors
- Test report: `iteration_34.json`

**DRY Refactor: Guard Consolidation**
- Eliminated 10 duplicate inline role-check functions across 6 route files
- Added 3 reusable utility functions to `guards.py`: `check_staff_role`, `check_founder_role`, `check_manager_or_admin`
- Refactored files: `staff_tools.py`, `ops_dashboard.py`, `operators.py`, `admin/task_management.py`, `admin/canned_responses.py`, `milestone_deliveries.py`
- Removed unused `HTTPException` import from `ops_dashboard.py`
- All 60 housekeeping checks pass, ruff clean, zero regressions

### Completed (March 31, 2026 — Phase 2 & Phase 3 Operations Overhaul)

**Phase 2: Admin Session Inactivity Timeout**
- Founder-controlled session timeout policies per role type (Admin, Manager, Worker, Benefactor, Beneficiary)
- `GET/PUT /api/admin/session-policy` — CRUD endpoints (Founder only)
- Each role can be independently enabled/disabled with configurable timeout (1-1440 minutes)
- `session_timeout_minutes` returned in `GET /api/auth/me` for client-side enforcement
- AuthContext integration: server-mandated timeout overrides user preferences
- Frontend: `SessionPolicyTab.js` with toggle switches and timeout dropdown per role
- Founder can exempt themselves by leaving Admin timeout disabled

**Phase 2: Queue Age Alerts UI**
- `QueueAlertsPanel.js` — notification bell in admin/ops header
- Real-time WebSocket connection to `/api/ws/notifications`
- Visual badge showing unread SLA breach and queue overflow count
- Dropdown panel with alert history, timestamps, dismiss/clear actions
- Connection status indicator (green=live, red=reconnecting)
- Auto-reconnect on disconnect with 5s backoff
- Toast-style alert categorization: SLA breach (red), queue overflow (amber)

**Phase 2: Internal Messaging / Team Chat**
- `routes/team_chat.py` — Full messaging backend
- 6 predefined system channels: General, Operations, Finance, Marketing, Compliance, Platform
- Direct message channels between any two staff members
- `GET /api/team/channels` — channels with unread count and last message preview
- `POST /api/team/messages` — send message (max 2000 chars)
- `GET /api/team/messages/{channel_id}` — paginated messages in chronological order
- `POST /api/team/channels/direct` — create or get DM channel
- `GET /api/team/staff` — list staff members for DM selection
- WebSocket real-time delivery: system channels broadcast to all staff, DMs sent to recipient only
- Read tracking: `team_channel_reads` collection with per-user per-channel last_read_at
- Frontend: `TeamChatTab.js` with channel sidebar, message area, role badges, DM creation
- DB indexes: `(channel_id, created_at)`, `sender_id`, `members`, `(channel_id, user_id)` unique

**Phase 3: Shift Scheduling**
- `routes/shift_scheduling.py` — shift management system
- Shift types: Day (6AM-2PM), Evening (2PM-10PM), Night (10PM-6AM), On-Call
- `POST /api/ops/shifts` — create shift (managers/admins only)
- `GET /api/ops/shifts` — list shifts with operator name enrichment
- `PUT /api/ops/shifts/{id}` — update status (workers can confirm own, managers can edit any)
- `DELETE /api/ops/shifts/{id}` — cancel shift (managers/admins only)
- `GET /api/ops/shifts/summary` — weekly coverage summary (7-day breakdown by shift type)
- Duplicate shift detection (same operator + date + type)
- Shift statuses: scheduled, confirmed, completed, cancelled
- **Shift Swap Requests**:
  - `POST /api/ops/shifts/swap-requests` — operator requests a swap with target operator
  - `GET /api/ops/shifts/swap-requests` — list requests (own for workers, all for managers)
  - `PUT /api/ops/shifts/swap-requests/{id}` — manager approves (reassigns both shifts) or denies
  - Duplicate pending request detection (409), self-swap prevention (400)
  - Real-time WebSocket notifications to target operator and requester on action
  - Frontend: swap button on shift cards, inline target selection, pending requests panel with approve/deny
- Frontend: `ShiftScheduleTab.js` with weekly calendar grid, Add Shift form, color-coded cards, swap UI
- DB indexes: `(operator_id, date)`, `date`, `shift_swap_requests.status/requester_id/target_operator_id`

**Phase 3: Training Completion Tracker**
- `routes/training_tracker.py` — training module tracking
- `GET /api/ops/training/modules` — modules with per-user completion status
- `POST /api/ops/training/complete` — mark module as completed
- `DELETE /api/ops/training/complete/{module_id}` — unmark completion
- `GET /api/ops/training/team-progress` — team-wide progress percentages (managers only)
- `POST /api/ops/training/modules` — create training module (managers only)
- Auto-seeds from Knowledge Base articles if no training_modules exist
- Certification badge when operator reaches 100% completion
- Frontend: `TrainingTrackerTab.js` with progress bar, team compliance view, checklist UI
- DB indexes: `(user_id, module_id)` unique, `order`

**Phase 3: Mobile-Optimized Ops View**
- Enhanced tab bar for operator mode: larger touch targets (44px min height), bigger text/icons
- `active:scale-[0.97]` press feedback on all tab buttons
- Touch-friendly shift cards and training module buttons
- Responsive layouts across all new components (grid breakpoints, flexible widths)
- All inputs use `fontSize: 16px` to prevent iOS auto-zoom

### Completed (March 31, 2026 — Platform Controls Overhaul)

**Admin Portal Reorganization**
- Tabs organized into 6 labeled sections: Operations, Finance, Marketing, Compliance, Platform, Admin
- Section labels visible in tab bar with color-coded dividers (gold/green/purple/blue/amber/red)
- Scoped admin filtering — non-founder admins see only their relevant sections

**Scoped Admin Roles**
- New model field: `admin_scope` (founder | finance | compliance | marketing | platform_health)
- `founder` = God mode — sees and controls everything
- CRUD endpoints: GET/POST/PUT/DELETE `/api/admin/scoped-admins`
- Founder cannot be demoted or deleted by other admins
- New guard: `require_admin_scope(user, allowed_scopes)` — founder always passes

**IP Whitelist per Account Type**
- Selectable per account type (Admin, Ops Manager, Ops Worker, Benefactor, Beneficiary)
- Toggle ON/OFF per type, managed by Founder only
- CRUD endpoints: GET/PUT `/api/admin/ip-whitelist`
- Enforcement at login: `check_ip_whitelist()` called after password verification
- Supports exact IP, prefix match, and wildcard

**Manager Escalation Resolution + Founder Veto**
- Managers can now resolve escalations (previously founder-only)
- Resolution tracks resolver role (admin vs manager)
- New endpoint: PUT `/api/ops/escalations/{id}/veto` — Founder can veto/undo manager resolutions
- Vetoed escalations reopen with history of previous resolution

**Task Assignment & Claiming System**
- POST `/api/ops/tasks/claim` — Worker self-assigns from queue
- POST `/api/ops/tasks/unclaim` — Release task back to queue
- POST `/api/ops/tasks/assign` — Manager assigns to specific operator
- PUT `/api/ops/tasks/prioritize` — Manual priority setting (1-5)
- SLA tracking: configurable per task type (support=4h, dts=24h, tvt=48h, etc.)
- SLA deadline set on claim/assignment

**Customer Context Panel**
- GET `/api/ops/customer-context/{user_id}` — Consolidated user view
- Shows: user info, estates, beneficiaries, documents count, recent support, DTS, activity
- Frontend component: `CustomerContextPanel.js`

**Bulk Operations**
- POST `/api/admin/bulk/assign-tier` — Bulk assign tier to multiple estates
- POST `/api/admin/bulk/toggle-beta` — Bulk toggle beta tester flag
- GET `/api/admin/export/users` — CSV export of all users
- GET `/api/admin/export/subscriptions` — CSV export of all subscriptions

**Platform Maintenance Mode**
- GET/PUT `/api/admin/maintenance-mode` — Toggle maintenance mode (Founder only)
- GET `/api/public/maintenance-status` — Public endpoint (no auth) for status check
- Shows message + estimated end time when active

**Canned Response Templates**
- CRUD endpoints: GET/POST/PUT/DELETE `/api/ops/canned-responses`
- Categories: general, billing, technical, onboarding, transition
- Usage tracking (use_count incremented on copy)
- Manager/Founder create/edit/delete; Workers read and copy

**Worker Performance Metrics**
- GET `/api/ops/performance` — Actions, tasks resolved/active, SLA breaches, avg/day
- Filterable by time range (7/14/30/60/90 days)
- Workers see own metrics; Managers see any operator's metrics
- Frontend: `PerformanceTab.js` with stat cards and category breakdown

**Subscription Paywall Dynamic Feature Listing**
- `/api/subscriptions/plans` now returns `tier_features` — dynamic list from feature gates
- Paywall shows real-time enabled features per tier (updates immediately after Save & Publish)
- Falls back to static plan features if no gates configured

**New Admin Tabs**
- IP Whitelist tab, Scoped Admins tab, Maintenance Mode tab, Canned Responses (Templates) tab, Performance tab

**Real-Time WebSocket Notifications**
- WebSocket endpoint: `/api/ws/notifications` (JWT-authenticated)
- Background SLA breach checker runs every 60 seconds
- Instant alerts broadcast to all connected staff when SLA deadlines are breached
- Queue overflow alerts when open items exceed configurable thresholds (support=10, dts=5, tvt=5, verification=10)
- Heartbeat/ping-pong to maintain connection health
- Persistent notifications also created via existing notification system

**Dev Switcher Portal Preview**
- "View Portal As" section added to Dev Switcher tab (Founder only)
- One-click preview of all admin scope views: Finance, Compliance, Marketing, Platform Health
- One-click preview of operator views: Ops Manager, Ops Worker
- "Restore Founder View" button to return to God mode
- No database changes — purely client-side scope override for preview

### Completed (March 31, 2026 — Feature Gating System)

**Per-Tier Feature Gating for Subscription Management**
- Admin-controlled visibility gating per subscription tier (Founder Admin Portal → Subs tab)
- 9 platform features gateable: Beneficiaries, MM, IAC, SDV, EGA, FFN, DAV, DTS, Timeline
- Dashboard always visible (exempt from gating)
- Core features (MM, SDV, IAC) marked with CORE badge, default to ON
- All features start as explicitly toggled ON (not hard-coded)
- Save & Publish workflow — changes don't take effect until published with confirmation
- Global toggle per feature — turn a feature ON/OFF across ALL tiers at once
- Unpublished changes banner with Discard button
- Backend API enforcement via `GET /api/subscriptions/enabled-features`
- Data preservation — toggling off only hides, never deletes user data
- Beneficiary post-transition access governed by benefactor's tier
- Feature gates are VISIBILITY-only (orthogonal to payment/beta). Per-user `is_beta_tester` flags and free-access overrides do NOT bypass feature gates.
- Route-level protection — gated routes redirect to dashboard
- Navigation filtering in Sidebar.js, MobileNav.js (bottom nav + hamburger menu)
- Dashboard stat cards + preview sections conditionally hidden
- New files: `routes/feature_gates.py`, `FeatureGatesCard.js`, `featureGates.js`
- Test coverage: 9/9 backend, full frontend validation

### Completed (March 31, 2026 — Codebase Refactoring for Efficiency)

**Admin Route Module Split (1866 → 7 focused files)**
- Split monolithic `routes/admin.py` into clean `routes/admin/` package:
  - `users.py` (264 lines) — User CRUD, role management, session exemptions, activity log
  - `analytics.py` (351 lines) — Stats, revenue metrics, launch metrics, trial users
  - `security_scan.py` (357 lines) — SOC 2 security scan audit
  - `estate_health.py` (433 lines) — Estate health, diagnostics, ghost/orphan cleanup
  - `platform.py` (209 lines) — Platform settings, site content, code health, photo migration
  - `grace_periods.py` (111 lines) — Grace period management
  - `dev_switcher.py` (114 lines) — Dev switcher configuration
  - `__init__.py` (24 lines) — Combines all sub-routers

**DRY Access Control Guards**
- Added `require_admin` and `require_staff` dependency guards to `guards.py`
- Applied across 17 route files, eliminating ~51 inline role checks
- Guard files converted: `admin/`, `founder_invites.py`, `beta.py`, `dts.py`, `compliance.py`, `admin_digest.py`, `support.py`, `transition.py`

**.gitignore Cleanup**
- Reduced from 947 lines (290+ duplicate blocks) to 85 clean lines
- Added `test_reports/` exclusion

**Disk Cleanup**
- Purged `__pycache__/` directories (~1.4 MB)
- Cleared `node_modules/.cache/` (~1.5 GB)
- Removed 142 stale test reports (kept latest 5)

**Verification: All 60 housekeeping checks PASS, 148 Python files ruff clean, all 14 admin endpoints verified**

**Grace Period Admin Tab**
- Added "Grace Periods" tab to Admin/Ops portal with stats (Active, On Hold, Files Purged, Completed, All)
- "Sort by Hold" toggle to surface held estates at top
- Inline actions: Confirm (for auto-paused transitioned estates), Place/Remove Hold, Purge Files, Purge MMs
- MM Purge requires password confirmation (final, irreversible action)

### Completed (March 31, 2026 — Subscription Access Architecture + Grace Period System)

**Phase 1: Subscription Access Guards**
- Added guards to FFN (create/update), Guardian AI chat, Beneficiary creation
- Documents upload, Messages create, Checklist, Transition, Milestone reports already guarded
- Expired users can still VIEW/DOWNLOAD but cannot CREATE/UPLOAD

**Phase 2: 90-Day Grace Period System**
- `services/grace_period.py`: Core service managing the entire grace period lifecycle
- Triggers: subscription_expired, trial_ended, transition_hospice
- Auto-pause for transitioned estates until staff confirms
- Admin "hold" button to pause purge indefinitely
- Re-subscription cancels grace period and restores full access
- Countdown emails at 90, 60, 30, 15, 10, 5, 4, 3, 2, 1 days to ALL estate-associated emails
- Daily scheduler (10 AM EST) for countdown processing and auto-purge

**Phase 3: Data Purge with Audit Trail**
- Removes file content (S3) but preserves metadata in `purge_records` collection
- Milestone Messages are NEVER purged (only eligibility to report new milestones revoked)
- Full audit trail for every purged file
- Admin-only manual purge trigger endpoint

**Milestone Delivery Audit**
- Full audit logging for all milestone delivery actions (approve/schedule/reject)
- Staff notifications (P3 alerts) confirming delivery
- Scheduled delivery also audited when auto-executed by scheduler

### Completed (March 31, 2026 — Scheduled Milestone Delivery + Subscription Gate)
- **"Send on Date Requested" feature**: Staff can now choose "Send Now" (immediate delivery) or "Send on [Event Date]" (scheduled delivery) when reviewing milestone message matches. A background scheduler runs daily at 9 AM EST to process due deliveries automatically.
- **Subscription gate on milestone reports**: Beneficiaries must have an active subscription to submit new milestone reports. Previously delivered messages remain accessible forever regardless of subscription status.
- **New "Scheduled" status**: Added to delivery pipeline with blue visual indicator in admin stats.
- **Manual trigger endpoint**: `POST /api/milestones/process-scheduled` allows staff to manually trigger scheduled delivery processing.

### Completed (March 30, 2026 — Mobile/PWA UX Compliance Fixes)
- **Fixed all Section E housekeeping checks** (10/10 PASS):
  - Check 50: Fixed 7 sub-11px font instances (`text-[9px]`→`text-[11px]`, `text-[10px]`→`text-[11px]`) in AdminPage.js and FounderInvitesTab.js
  - Check 52: Added `safe-area-inset-top` to `toast.jsx`, `MobileNav.js`, `NetworkStatusBanner.js`
  - Check 54: Fixed 14 inputs/textareas across 12 files from `text-sm` to `text-base` (16px) to prevent iOS auto-zoom
  - Check 55: Added `overflow-y-auto` to 15 modal backdrop containers across the app for scroll safety on small screens

### Completed (March 30, 2026 — Sort Fix in Admin/Ops Users Tab)
- **Fixed sort dropdown** in UsersTab (shared by Founder Portal and Ops Portal): hierarchy (tree) view and graph (visual tree) view now respect the user's sort selection (First Name, Last Name, Date Created, Birthday, Most/Least Beneficiaries). Previously these views always hardcoded age-based sorting regardless of dropdown selection.
- **iOS zoom prevention**: Fixed sort `<select>` element font-size from 11px to 16px to prevent iOS auto-zoom on focus.

### Completed (March 29, 2026 — Session: Public About & Invite-Only Founder Pages)

#### Public "About for Everyone" Page
- **Improved backgrounds** on the existing AboutPage.js: warmer color palette (#0d1b2a), enhanced radial gradients with golden accents, better section layering
- Updated section backgrounds across hero, mission/vision, values, who we are, and CTA sections
- Updated nav bar border to match the warmer theme
- "About" header nav link continues to point to `/about`

#### Invite-Only "About the Founder" Page
- **New FounderAboutPage.js** component at `/founder-about/:token` route
- Renders the original `CarryOn_Founder.html` (11MB with 7 base64 embedded images) via iframe — all embedded styles/backgrounds preserved exactly as provided
- **Token verification flow**: verifying → valid (show iframe) → invalid (show Access Restricted with specific reason)
- Access denied states: not_found, revoked, no_token, error — each with tailored messaging
- "Visit About CarryOn" fallback button on denied pages

#### Founder Invite System (Backend)
- **Two separate collections**: `founder_invites` (token links) and `founder_access_requests` (request-based access)
- **Invite Links** — reusable, revocable tokens:
  - POST /api/founder/invites, GET /api/founder/invites, DELETE /api/founder/invites/:token
  - GET /api/founder-about/verify/:token — validates + tracks views
- **Access Requests** — request → admin approval with password → email+password login:
  - POST /api/founder/requests — public, submit request + email notification to admin
  - GET /api/founder/requests — admin lists all requests
  - POST /api/founder/requests/:id/approve — admin sets password
  - POST /api/founder/requests/:id/deny — admin denies
  - POST /api/founder/requests/:id/revoke — admin revokes approved access
  - POST /api/founder-about/login — public, email+password verification (reusable until revoked)

#### "Founder" Nav Button & Request Modal
- **"Founder" button** added to homepage header nav (right of "About")
- Opens a **frosted glass overlay** on the hero flag background
- Request form: name, email, optional message
- Duplicate pending request detection
- Success/already-pending/error states with branded UI
- "Already have access? Sign in here" link → /founder-about login form

#### Founder Page Login (/founder-about)
- Email + password login form (no OTP required)
- Frosted glass card over darkened flag background
- Password visibility toggle
- Error messages for wrong password, no access, etc.

#### Admin Panel Invites Tab (Updated)
- **Two sections**: Invite Links + Access Requests
- Access Requests show: pending (with approve/deny), approved (with revoke), denied, revoked
- Admin sets password manually when approving
- View count tracking for both invite links and approved requests

#### Admin Panel Invites Tab
- **New FounderInvitesTab** component added to Admin page at `/admin/founder-invites`
- Stats dashboard: Total / Active / Used invite counts
- Generate Invite Link form with optional note (e.g., recipient name)
- Invite list with status badges (Active/Used/Revoked), copy link, revoke actions
- Tab added to TAB_CONFIG with Gift icon


### Completed (March 25, 2026 — Session 29: Sidebar Portal Label Redesign + PWA Cleanup)

### Completed (March 26, 2026 — Session 30: Security Settings Consolidation + Email Preview Fixes)

#### Security Settings Consolidation (March 26, 2026)
- **Moved Account Security** (Passkey, 2FA, SMS OTP) from general Settings page to dedicated Security Settings page
- **Added Auto-Logout Timer** to Security Settings page with options: On App Leave (Instant), 1, 3, 5, 10, 15, 30 minutes, Daily (Midnight)
- **Daily (Midnight) auto-logout**: Calculates ms until local midnight and schedules a logout timer. Resets each session.
- **Removed auto-logout** from AppearanceCard (was previously under Appearance settings)
- **AuthContext updated** to handle `0` value for instant logout on app leave (triggers immediately on `visibilitychange` hidden)
- **Settings page** now shows a navigation card linking to Security Settings instead of inline security controls

#### Email Preview Modal Fixes (March 26, 2026)
- **Opaque background**: Changed modal overlay from transparent `bg-black/60` + `bg-[var(--card)]` to solid `bg-black/80` + `#0b1120`
- **Visible Close button**: Changed from ghost variant to outlined button with white text
- **Sticky header**: Preview modal header sticks to top when scrolling
- **Responsive Audit Digest**: Changed email HTML from fixed `width=600` to `max-width:600px`, reduced padding from 40px to 20px for mobile-friendly rendering

### Completed (March 26, 2026 — Session 29: SOC 2 Type 2 Hardening)

#### SOC 2 Compliance — 7-Item Implementation (March 26, 2026)
1. **Comprehensive Audit Logging**: Added `login_failed` audit events (warning severity) with IP address and reason. Added `stored_at` datetime field for TTL. All audit entries include SHA-256 integrity hashing.
2. **Session Management Hardening**: Password change now revokes ALL active sessions via `revoke_all_user_tokens()` and clears `active_session_id` / `last_login_at`. Single-session enforcement already existed.
3. **API Rate Limiting**: Already comprehensive — no changes per user request (120/min auth, 60/min moderate, 300/min general).
4. **Data Access Logging**: Added audit logging for beneficiary list views (`beneficiary_list_view` / `data_access` category), digital wallet access (`digital_wallet_view` / `data_access` category) with entry counts and access type.
5. **Admin Activity Trail**: Added CSV export endpoint (`GET /founder/audit-trail/export`) with configurable date range (30d/365d) and category/severity filters. Export button added to AuditTrailTab UI. Added `data_access` filter category.
6. **Automated Data Retention**: TTL index on `audit_trail.stored_at` (365 days auto-expiry). Daily `data_retention_scheduler` purges expired OTP trust, stale failed logins (7d), old OTP codes (1h), and blacklisted tokens (30d).
7. **Security Headers**: Already production-grade — HSTS (preload), CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, COOP, CORP, Permissions-Policy, Cache-Control on API routes. No changes needed.

#### SOC 2 Weekly Audit Digest + Founder Email Management (March 26, 2026)
- **Weekly SOC 2 Audit Digest email**: Auto-sent every Monday with analytics digest. Includes: total events, failed logins, critical/warning counts, data access patterns, password changes, top failed login IPs, most active users, daily activity sparkline chart.
- **Founder Email Management tab**: New `Emails` tab in Admin page with toggle controls for: Weekly Analytics Digest, SOC 2 Audit Digest, Security Alerts. Each has Send Now / Preview buttons. Audit digest supports additional recipients (e.g., external auditors).
- **Endpoints**: `GET/PUT /admin/email-preferences`, `POST /admin/audit-digest/send`, `GET /admin/audit-digest/preview`
- **Scheduler**: `send_audit_digest()` runs alongside `send_admin_analytics_digest()` in weekly scheduler, respects founder enable/disable preferences.

#### Sidebar Portal Label Redesign (March 25, 2026)
Restructured the sidebar logo/branding area in DashboardLayout:
- **Layout**: Portal label (e.g., "FOUNDER PORTAL", "BENEFICIARY PORTAL") now sits beneath both the logo icon AND "CarryOn™" text, spanning the full width
- **Sizing**: Logo enlarged to 54px, CarryOn™ to 28px, portal label to 16px bold white — all sized to stretch the full sidebar width
- **CarryOn™ alignment**: Text is now vertically centered on the logo icon via flexbox
- **Section titles**: "ESTATE PLAN ACCESS" added to benefactor nav (matching beneficiary), all section titles ("ESTATE PLAN ACCESS", "ACCOUNT", "TOOLS") increased to 14px bold for proper visibility across all portals
- **MobileNav**: Same section title updates applied — benefactor menus now show "ESTATE PLAN ACCESS", section titles enlarged to `text-sm font-bold`
- **Light mode**: Portal label uses dark navy (#0F172A), section titles use (#475569)

#### PWA iOS Swipe-Back — Abandoned (March 25, 2026)
After 4+ attempts across multiple sessions (touchmove blocking, pushState→replaceState monkey-patch, popstate interception with history trap), confirmed that iOS intercepts the swipe-back gesture at the system level before any web JavaScript can handle it. All swipe-back prevention code has been removed to keep the codebase clean. This is a known iOS WebKit limitation with no web-level workaround.

### Completed (March 25, 2026 — Session 28: Funnel Skip Sensitivity + Summary Refinement)

#### Fireworks Celebration on CTA Screen (March 25, 2026)
Added an American flag-themed fireworks display when the user reaches Step 4 (CTA) after completing their personalized plan:
- Uses `canvas-confetti` (1.9.4) with firework-style 360° bursts from randomized sky positions
- 8 staggered bursts over ~2 seconds, each with 80 particles (60 fast + 20 slow inner ring)
- Red/white/blue/gold color palettes matching the American flag motif and app aesthetic
- Fires only once per funnel session (ref-guarded)
- Reinforces the accomplishment of building a personalized plan and boosts trial conversion

#### Funnel "Skip" Visual Feedback & Summary Refinement (March 25, 2026)
Improved the funnel's feature card interaction to provide clear visual feedback and a respectful, personalized summary:

- **Skip Visual Feedback**: When tapping "Not for me", the current card now dims (60% opacity), scales down (0.97), and shifts to a warm-pink tint before transitioning to the next card after 450ms. Fixed a bug where the flash incorrectly showed on the *next* card instead of the one being skipped.
- **Summary Screen Rewrite**: After all feature decisions, the summary now shows:
  - **Top section**: Features the user kept, with a gold sparkles icon and confident message: "Your plan is built around these"
  - **Below separator**: Gently lists skipped features with warm copy: "And just in case you change your mind, these are included free during your trial — so you can experience them firsthand."
  - **Edge case**: If all features are skipped, shows: "All of our features are included free during your trial — explore everything and decide what fits."
- Tone validates user choices, reflects them back, and presents skipped features as a gift — not a correction or upsell.

### Completed (March 25, 2026 — Session 27: Acquisition Funnel + IAP Consolidation)

#### Social Media Acquisition Funnel (March 25, 2026)
Full campaign attribution and conversion tracking system for social media ad campaigns:

- **Frontend — `/get-started` funnel page** (`GetStartedPage.js`): 5-screen mobile-first onboarding flow
  - Screen 1: Interest selection (6 bubbles: protect family, organize docs, plan unexpected, guide beneficiaries, digital credentials, I'm a beneficiary)
  - Screen 2: Family qualification (family size, estate status, urgency)
  - Screen 3: Personalized feature cards with keep/skip interaction
  - Screen 4: CTA with social proof stats and "Start Free Trial" button
  - Screen 5: Referral — invite family member for +7 days trial bonus for both parties
- **Backend — Funnel API** (`/app/backend/routes/funnel.py`):
  - `POST /api/funnel/start` — Creates anonymous session, captures UTMs, IP geolocation via ip-api.com
  - `POST /api/funnel/step` — Records step completion with user selections
  - `POST /api/funnel/complete` — Marks funnel as completed, stores referral email
  - `POST /api/funnel/convert` — Links funnel session to user after signup, extends trial +7 days for referral
  - `GET /api/admin/funnel/analytics` — Aggregated analytics: drop-offs, by source, by campaign, by device, by state, by interest, referrals, recent sessions
- **Firebase Analytics** (`/app/frontend/src/services/firebase.js`): Initialized on funnel mount, fires events at each step for demographics, retention, and audience insights
- **Meta Pixel**: Placeholder ready — fires `ViewContent`, `Lead`, `CompleteRegistration` events. Will activate when Pixel ID is provided.
- **Admin Funnel Tab**: New tab in Founder portal with full analytics dashboard (drop-off waterfall, source/campaign comparison, device breakdown, geographic heatmap, interest clustering, referral stats, recent sessions table)
- **Login Page**: Added subtle "New to estate planning? See what CarryOn can do →" link on both mobile and desktop
- **Safeguards**: Logged-in users redirect to dashboard, returning non-converted visitors restart at CTA (Screen 4), 7-day reset for fresh funnel experience
- **Integrations Tab**: Added Firebase Analytics (active, free) and Meta Pixel (blocked, awaiting Pixel ID) tiles to admin Integrations tab under new "Analytics" category

#### IAP Logic Consolidation (March 25, 2026)
Extracted duplicated Apple In-App Purchase logic from `SubscriptionPaywall.js` and `SubscriptionManagement.js` into a single `useIAPPurchase` custom hook at `/app/frontend/src/hooks/useIAPPurchase.js`:
- **Hook API**: `useAppleIAP` (boolean), `restoringPurchases` (boolean), `purchaseWithIAP(planId, billing)`, `restoreWithIAP()`
- **SubscriptionPaywall.js**: Removed inline `useAppleIAP` state, `isIAPAvailable` useEffect, manual product ID resolution, and `handleRestorePurchases` implementation — all replaced with hook calls
- **SubscriptionManagement.js**: Removed `isIAPAvailable`/`purchaseIAP` imports and inline IAP logic in `handleSubscribe`, `handleChangePlan`, and `handleChangeBilling` — all three now use `purchaseWithIAP(planId, billing)` from the hook
- Zero behavior changes — pure DRY refactor. Product ID resolution uses the canonical `IAP_PRODUCTS` map in all paths now.
- **Updated housekeeping.sh** check #43 to recognize the hook import pattern alongside direct `services/iap` imports

#### Backlog Items Resolved (March 25, 2026)
- **Orbiting Estates UI Performance**: Confirmed fixed by user — crossed off backlog
- **Video Playback on Milestone Page**: Confirmed fixed by user — crossed off backlog (was recurring 5x)
- **Settings Page UI Glitch (FOUC)**: Crossed off backlog per user request

### Completed (March 25, 2026 — Session 26: Landing Page Background Lightening)

#### Landing Page Hero & Section Backgrounds (March 25, 2026)
Lightened the landing page to make the American flag hero image more visible and all scrolling sections slightly lighter:
- **Hero flag**: Increased opacity from `0.7` to `0.85` and reduced dark gradient overlay from `0.2/0.7` to `0.05/0.45`
- **Section backgrounds**: Changed base color from `#0B1221` to `#0E1829` across all sections (About, Features, Platform, Security, CTA)
- **Gradient sections**: Changed from `#0F1A2E/#0B1221` to `#111F34/#0E1829` (Reframe, Platform Features, Three Steps)
- **Texture overlays**: Slightly increased opacity on texture images so they show through more
- **Section gradient overlays**: Reduced opacity values by ~15-20% across all sections
- No content, layout, or functionality changes — purely cosmetic background lightening.

### Completed (March 24, 2026 — Session 25: Beneficiary Feature Enforcement + IAP Hardening)

#### SettingsPage.js Refactoring (March 25, 2026)
Extracted 1,626-line monolith into 7 self-contained component files + a 153-line layout shell:

- `ProfileCard.js` (269 lines) — Profile photo, display name, username, password
- `SecurityCard.js` (269 lines) — Passkey, 2FA toggle, SMS OTP setup/verify/disable
- `PersonalInfoCard.js` (230 lines) — Name, phone, DOB, gender, marital status, address
- `EstatePhotoCard.js` (146 lines) — Estate photo and name editing
- `AppearanceCard.js` (87 lines) — Theme, auto-logout, onboarding guide toggle
- `DigestCard.js` (272 lines) — Estate Health Digest preferences, frequency, sections, recipients
- `PrivacyCard.js` (295 lines) — GDPR consent, data export, retention policy, account deletion
- Each component manages its own state and data fetching. Zero visual or behavioral changes.
Benefactors toggle 7 feature flags per beneficiary (mm_access, ega_access, sdv_access, iac_access, ffn_access, dav_access, dts_access). Previously, beneficiary portal showed everything regardless. Now fully enforced:

- **Backend**: `GET /api/beneficiary/my-permissions/{estate_id}` now returns `feature_access` object with all 7 flags from the beneficiary record
- **TransitionGate.js**: Blocks navigation to denied sections (e.g., `/beneficiary/vault` if `sdv_access=false`) and redirects to `/beneficiary/dashboard`
- **BeneficiaryDashboardPage.js**: Stat cards and preview sections conditionally rendered based on `myPerms.feature_access`. Also optimized: permissions fetched once instead of twice.
- **Sidebar.js + MobileNav.js**: Navigation items filtered via `filterByFeatureAccess()` — hidden links for disabled features
- **localStorage**: `beneficiary_feature_access` stored by TransitionGate for nav components; cleaned up on context exit

#### Twilio SMS OTP Integration (March 24, 2026)
Full SMS-based two-factor authentication using Twilio. Users can set up SMS 2FA from Settings, and choose SMS vs Email on the login OTP screen.

- **Backend Endpoints**:
  - `GET /api/auth/sms-otp-status` — Returns current SMS OTP status and masked phone
  - `POST /api/auth/sms-otp-setup` — Sends verification SMS to provided phone (requires consent checkbox)
  - `POST /api/auth/sms-otp-verify` — Verifies phone OTP and enables SMS 2FA on user record
  - `DELETE /api/auth/sms-otp` — Disables SMS 2FA and removes phone number
- **Modified Endpoints**:
  - `POST /api/auth/login` — Now returns `otp_method`, `has_sms`, `masked_phone` when user has SMS enabled; sends OTP via SMS first, falls back to email
  - `POST /api/auth/resend-otp` — Accepts `method` parameter (`email` or `sms`)
- **Frontend — Settings Page**: SMS setup flow under Security card: phone input → consent checkbox → verification code → enabled. Only shows when 2FA is enabled.
- **Frontend — Login OTP Modal**: Shows SMS/Email toggle buttons when user has SMS enabled. Displays correct description based on delivery method. Resend button respects selected method.
- **IMPORTANT**: Twilio A2P 10DLC campaign resubmitted on March 24, 2026 with corrected CTA, opt-in flow, and differentiated message samples. Check back with Twilio in 2-3 weeks (mid-April 2026) for approval status. Once approved, SMS OTP delivery will go live.

#### IAP Fix Hardening (March 24, 2026)
- Added 10s timeout to `isIAPAvailable()` — previously no timeout, could hang forever
- Added 15s timeout to `getIAPProducts()` — prevent Store fetch hang
- Added 30s timeout to `restoreIAPPurchases()` — prevent restore hang
- Enhanced error diagnostics: when StoreKit can't find a product, logs available products and shows actionable guidance
- **Root cause of "Cannot find product" error identified**: User's Apple Developer account lacks a Paid Applications Agreement. Only a Free Apps Agreement exists. Without it, StoreKit returns no products. User is resolving with Apple.

## P0/P1/P2 Prioritized Backlog

### P0
- **SVG Family Tree Visual Overhaul**: COMPLETED (Session 17+18+19+20)

### Completed (March 25, 2026 — Session 29: SDV Drag-and-Drop Fix)

#### PWA Login Flow + Homepage Split (March 25, 2026)
Implemented PWA-optimized login architecture for App Store-less launch:
- **`/login` in PWA standalone mode**: Clean login-only view — CarryOn logo, "CarryOn™" text, login card (same form, OTP, forgot password), and "Visit Homepage" button that opens Safari via `window.open('/home', '_blank')`
- **`/login` on desktop/mobile browser**: Full marketing experience exactly as before — completely unchanged
- **`/home` (new page)**: Standalone marketing landing page with all content (About, Reframe, Features, Platform, Steps, Security, Hospice, CTA, Footer). Centered hero with "Get Started" and "Sign In" CTAs. Nav bar with "Sign In" link.
- **Option B (post-login)**: PWAInstallGuide modal fires 2s after first login from mobile browser. Step-by-step walkthrough auto-detects iOS Safari, iOS Chrome, or Android Chrome and shows platform-specific instructions. "Can't find it?" expandable for Safari top-bar users.
- **Option C (login banner)**: Persistent bottom banner on `/login` for mobile Safari/Chrome users (not PWA). "Get the CarryOn App — Install" with dismiss option. Uses localStorage to remember dismissal.
- **PWA detection**: `display-mode: standalone` media query + `navigator.standalone` fallback.
- All 50 housekeeping checks pass. Testing agent: 100% pass (8/8 tests).
Fixed drag-and-drop file rejection for PDFs in the Secure Document Vault:
- **Root cause**: File type validation only recognized `application/pdf` MIME type. Some browsers/OS combos report PDFs as `application/x-pdf`, `application/acrobat`, or `application/vnd.pdf`. Extension parsing via `split('.').pop()` also failed on filenames with trailing whitespace.
- **Fix**: Replaced inline validation with centralized `isFileAllowed()` function using regex-based extension extraction (`/\.([a-z0-9]+)\s*$/i`) and expanded MIME list. Applied to both global page drop handler and inner upload panel drop zone.
- **Auto-focus**: Added `uploadNameRef` + `pendingDropFocusRef` so the Document Name input auto-focuses 350ms after the upload panel opens from a drag-drop, matching user expectation of cursor-ready input.
- **Share target**: Updated `useShareTarget.js` ACCEPTED_TYPES with same expanded MIME list.
- **File input**: Updated `accept` attribute to include `.pdf` extension fallback and `application/x-pdf`.
- All 50 housekeeping checks pass.

### P1
- **Share Extension Setup**: Re-add the Share Extension target in Xcode per `/app/memory/SHARE_EXTENSION_SETUP.md`
- **iOS Live Updates**: Test Capgo OTA update flow end-to-end

### P2
- **Scalability Enhancements**: Horizontal scaling, background workers, CDN
- **Readiness Scoring Policy Page**: Informational page under Account section
- **Twilio SMS OTP**: A2P campaign resubmitted March 24, 2026. Check back mid-April 2026.

### P3
- **ECT Security Comparison Landing Page**: Public page at `/security` with visual comparison table (CarryOn ECT vs Signal vs WhatsApp vs iMessage). Covers: closed network, no phone required, owner-controlled access, zero data mining, metadata privacy. For marketing/acquisition funnel use.

## Key API Endpoints
- `POST /api/security/verify/{section_id}` — validates PIN/Password/Question combos
- `GET /api/security/master-key-status` — checks if master key exists
- `GET /api/guardian/iac-task-status` — polls for EGA IAC generation status (running/completed/error)
- `POST /api/chat/guardian` — EGA AI chat with action support (generate_iac, analyze_vault, etc.)
- `GET /api/estate-chat/channels` — lists ECT channels with unread counts (New)
- `POST /api/estate-chat/channels` — creates ECT group/direct channels (New)
- `GET /api/ccp/plans/{estate_id}` — lists CCP emergency plans (New)
- `POST /api/ccp/activate` — activates emergency plan or drill (New)
- `POST /api/ccp/checkin` — member check-in with status (New)
- `GET /api/ccp/active/{estate_id}` — real-time status board (New)

## Critical Notes
- **User Testing Protocol**: User NEVER tests on preview URL. Deploys via GitHub → Railway/Vercel → tests on iOS device.
- **Voice Biometrics**: Completely removed. Do not reintroduce.
- **Eyeball Icons**: Any new password inputs MUST include `onMouseDown={(e) => e.preventDefault()}`.
- **Downloads**: All PDF downloads must use `/app/frontend/src/utils/downloadFile.js` for cross-platform compatibility.
- **SVG in JSX**: Platform's Babel plugin wraps dynamic JSX expressions (`{arr.map(...)}`, `{(() => { ... })()}`) inside SVG elements in a `<span>`, breaking SVG rendering. Use `dangerouslySetInnerHTML` for any dynamic SVG content.
- **FamilyTree.js**: DO NOT modify styling unless explicitly instructed. Extremely sensitive area.
- **Onboarding Flow (March 23, 2026)**: Simplified to 4 steps max. Address removed from signup — prompted at EGA with link to Settings. Beneficiary enrollment removed from signup — now first Getting Started step.
- **iOS Safe Area (March 23, 2026)**: Platform-wide fix — all Radix UI popper components (Select, DropdownMenu, Popover) use `collisionPadding` via `getSafeAreaTop()` to prevent dropdown content from rendering behind the iOS status bar/Dynamic Island. Dialog and Sheet components also respect safe area insets. Utility at `/app/frontend/src/lib/safeArea.js`.

## Signup Flow (Simplified March 2026)
- **Benefactor**: Name+Gender+DOB → Role → Special Eligibility → Credentials (4 steps)
- **Beneficiary**: Name+Gender+DOB → Role → Benefactor Email → Credentials (4 steps)
- **Minor (<18)**: Name+Gender+DOB+BenefactorEmail → Credentials (2 steps, auto-beneficiary)
- **Post-OTP**: Benefactors → /dashboard (with Getting Started overlay), Beneficiaries → /beneficiary

## Getting Started Flow (7 steps)
1. Add a Beneficiary (NEW)
2. Create a Milestone Message
3. Upload an Estate Document
4. Consult the Estate Guardian (requires address in Settings)
5. Customize Action Checklist
6. Set Succession Order **(optional)** — skip shows explanation, marks complete
7. Store a Digital Credential **(optional)** — skip shows explanation, marks complete
