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

### Session: March 11, 2026

**Batch 1 - UI Tweaks:**
- Notification panel repositioned to grow upward from bell button
- DEV switcher fix: Operations Portal no longer highlights when logged as operator
- Mobile dialog scroll CSS fix for PWA

**Batch 2 - Operator Credentials:**
- Added Login Credentials section (username + password) to operator edit dialog
- Backend supports username update with uniqueness validation
- Fixed case-sensitivity bug in operator creation (username now lowercased)

**Batch 3 - DEV Session Isolation:**
- Created `create_dev_session_token` — generates tokens that do NOT invalidate real user sessions
- Added `dev_session` flag to JWT tokens; session validation skips single-session check for dev tokens
- Updated all DEV pathways: `dev-switch`, `dev-login`, `operator-dev-login`
- Founder can now impersonate any account without kicking out the real user

### Previous Sessions
- Major sidebar & navigation redesign (desktop + mobile unified)
- Ops Portal Users tab bug fix
- Portal pill labels/colors fix
- "Legacy" to "Estate Plan" terminology overhaul
- Deprecated services removal (Will/Trust Wizard & Eternal Echo)
- Default last-viewed portal feature (localStorage)
- Backend housekeeping (MongoDB index fix, null DOB fix)

## Prioritized Backlog

### P1
- Finalize Share Extension Setup (Xcode, see /app/memory/SHARE_EXTENSION_SETUP.md)
- Twilio SMS OTP Integration (blocked on A2P 10DLC approval)

### P2
- ESLint code cleanup (non-critical warnings)
- Review beneficiary settings page for race condition (one-time flash glitch)

## Key Accounts
- Founder/Admin: info@carryon.us / Demo1234!
- Test Benefactor: fulltest@test.com / Password.123

## Key Files
- backend/utils.py (create_token with dev_session flag, session validation)
- backend/routes/auth.py (create_dev_session_token, dev-switch, dev-login)
- backend/routes/operators.py (operator-dev-login, operator CRUD with username support)
- frontend/src/components/admin/OperatorsTab.js (edit dialog with credentials)
- frontend/src/components/NotificationBell.js
- frontend/src/components/layout/Sidebar.js
- frontend/src/components/layout/MobileNav.js

## Deployment Notes
- Backend changes deploy immediately via Railway (affects live app + TestFlight)
- Frontend changes deploy via Vercel (does NOT update TestFlight app)
- TestFlight builds managed separately via CodeMagic
