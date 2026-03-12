# CarryOn Estate Planning Platform - PRD

## Original Problem Statement
AI-powered estate planning platform (CarryOn) with multi-portal architecture: Benefactor, Beneficiary, Founder (Admin), and Operations portals. Native mobile app (Capacitor/iOS) + PWA + Desktop web.

## Core Architecture
- **Frontend:** React + Tailwind + Shadcn/UI, deployed via Vercel
- **Backend:** FastAPI + MongoDB, deployed via Railway
- **Mobile:** Capacitor (iOS), builds via CodeMagic, distributed via TestFlight
- **AI:** xAI (Grok) for Estate Guardian
- **Payments:** Stripe + Apple IAP
- **Storage:** AWS S3-compatible
- **Email:** Resend
- **SMS:** Twilio (scaffolded, pending A2P 10DLC)
- **Auth:** JWT-based with OTP verification, single-session enforcement

## What's Been Implemented

### Session: March 12, 2026 (Current)

**Bug Fix: Benefactor Photo Not Showing in Beneficiary Portal**
- Fixed photo display in beneficiary hub when benefactor's photo wasn't rendering (showed initials instead)
- Root cause: Field name mismatch between `family-connections` API (`photo_url`) and `estates` API (`owner_photo_url`). When `family-connections` returned empty, the fallback to estates data failed to render photos because OrbitVisualization and family list only checked `photo_url`.
- Frontend fixes in `BeneficiaryHubPage.js`: Normalized `owner_photo_url` → `photo_url` in estates fallback mapping; preferred `benefactor_name` over estate name in family list
- Frontend fix in `OrbitVisualization.js`: Added `owner_photo_url` fallback check for photo rendering
- Backend fix in `estates.py`: `create-estate` endpoint now sets `is_also_beneficiary: true` on existing users enrolled as beneficiaries
- Testing: 100% pass rate (8/8 backend, all frontend photo rendering verified)

**Cross-Pollination Role Fix: is_also_benefactor Permission Grants**
- Fixed 16 backend endpoints across 7 route files that blocked beneficiary-turned-benefactors from managing their own estates
- Pattern changed: `role != 'benefactor'` → `role != 'benefactor' and not is_also_benefactor`
- Files fixed: `messages.py` (3), `documents.py` (4), `checklist.py` (3), `digital_wallet.py` (1), `dts.py` (1), `estates.py` (3), `admin.py` (1)
- Enables full family cross-pollination: everyone can be both benefactor and beneficiary of each other
- Testing: 100% pass rate (17/17 tests, including regression and ownership enforcement)

### Session: March 11, 2026

**Operator Portal Enhancements - Dynamic Dashboard & Permissions:**
- New `/api/ops/dashboard-events` endpoint: Aggregates 6 event types (TVT, Milestones, DTS, Emergency, P1 Emergency, Support)
- New `/api/ops/team-tasks` endpoint: Returns active tasks per operator for manager team overview
- Updated `/api/admin/stats` with new fields: pending_milestones, pending_emergency, p1_emergencies, open_escalations
- 6 dynamic "light-up" dashboard tiles on operator portal:
  - TVT (death certificate submissions)
  - Milestone Notifications
  - DTS Requests
  - Emergency Messages (beneficiary emergency access)
  - P1 Alert (benefactor still alive alerts)
  - Customer Service replies
- Tiles glow and pulse when items need attention, with click-to-navigate
- P1 and Emergency tiles have enhanced urgency styling (larger glow, pulse animation)
- Manager Team Activity section: Shows each operator's assigned tasks with type, title, status
- Clicking a task navigates to the relevant tab
- Subs tab: Only visible to Managers (not Workers)
- Delete permissions enforced: Founders delete anyone, Managers delete workers only, Workers cannot delete
- Backend enforces all permission checks (not just UI hiding)

**Push Notification Audit & Fixes:**
- Verified all 6 event types have staff push notifications:
  - TVT: P2 alert to all staff + security alert to benefactor ✅
  - Milestones: P3 alert (with matches) + P4 alert (no matches) to operators ✅ FIXED
  - DTS Creation: P4 alert to operators ✅
  - DTS Quote: P4 alert to operators ✅ ADDED
  - DTS Approval: P4 alert to operators ✅ ADDED
  - DTS Status Change: P4 alert to operators ✅ ADDED
  - Emergency Access: P2 alert to all staff ✅ FIXED (was using old send_push_to_all_admins)
  - P1 Emergency: Amber Alert (all_staff_security) to ALL staff ✅
  - Customer Service Reply: P4 alert to operators ✅

### Previous Session: March 11, 2026

**Batch 1 - UI Tweaks:**
- Notification panel repositioned to grow upward from bell button
- DEV switcher fix: Operations Portal no longer highlights when logged as operator
- Mobile dialog scroll CSS fix for PWA

**Batch 2 - Operator Credentials:**
- Added Login Credentials section (username + password) to operator edit dialog
- Backend supports username update with uniqueness validation
- Fixed case-sensitivity bug in operator creation (username now lowercased)

**Batch 3 - DEV Session Isolation:**
- Created `create_dev_session_token` for impersonation without invalidating real sessions
- Added `dev_session` flag to JWT tokens
- Updated all DEV pathways: `dev-switch`, `dev-login`, `operator-dev-login`

### Earlier Sessions
- Major sidebar & navigation redesign (desktop + mobile unified)
- Ops Portal Users tab bug fix
- Portal pill labels/colors fix
- "Legacy" to "Estate Plan" terminology overhaul
- Deprecated services removal (Will/Trust Wizard & Eternal Echo)
- Default last-viewed portal feature (localStorage)
- Backend housekeeping (MongoDB index fix, null DOB fix)

## Prioritized Backlog

### P0
- None

### P1
- Finalize Share Extension Setup (Xcode, see /app/memory/SHARE_EXTENSION_SETUP.md)
- Twilio SMS OTP Integration (blocked on A2P 10DLC approval)

### P2
- ESLint code cleanup (non-critical warnings)
- Review beneficiary settings page for race condition (one-time flash glitch)
- AdminPage.js refactoring (growing complexity)
- beneficiaries.py: Abstract repeated role checks into utility
- UsersTab.js: Split into smaller components

## Key Accounts
- Founder/Admin: info@carryon.us / Demo1234!
- Test Benefactor: fulltest@test.com / Password.123
- Test Spouse Benefactor: spouse@test.com / Password.123

## Key Files
- backend/routes/ops_dashboard.py (dashboard-events, team-tasks, ops dashboard endpoints)
- backend/routes/admin.py (stats with milestone/emergency/p1/escalation counts)
- backend/routes/operators.py (operator CRUD with role-based permissions)
- frontend/src/pages/AdminPage.js (operator tiles, team activity, tab filtering)
- frontend/src/components/admin/OperatorsTab.js (delete/edit with permission controls)
- frontend/src/components/admin/SubscriptionsTab.js (operatorMode hides pricing)
- frontend/src/components/layout/Sidebar.js (nav structure per role)

## Deployment Notes
- Backend changes deploy immediately via Railway (affects live app + TestFlight)
- Frontend changes deploy via Vercel (does NOT update TestFlight app)
- TestFlight builds managed separately via CodeMagic
