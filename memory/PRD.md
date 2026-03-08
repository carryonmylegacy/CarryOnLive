# CarryOn Platform - Product Requirements Document

## Original Problem Statement
Multi-portal estate planning platform with four distinct roles: Benefactor, Beneficiary, Founder (admin), and Operator. The platform manages estate documents, milestone messages, beneficiary management, and operational workflows.

## Core Architecture
- **Frontend:** React (CRA) with Shadcn UI components
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Roles:** Benefactor, Beneficiary, Founder (admin), Operator

## Critical Invariants
- **ONE-WAY CHECK VALVE:** A beneficiary can NEVER access the benefactor account that designated them.
- **Membership-Based Access:** Backend checks actual estate relationship, NOT user role, for data access.
- **Estate Isolation:** Data is fully siloed per estate.
- **DO NOT modify yarn.lock carelessly** — caused production crashes previously.
- **Soft-delete is the standard** for all operational data deletions.
- **PATH-BASED UI RENDERING:** For staff portals, UI variation depends on the URL path (/admin vs /ops), NOT just the user's role.

## What's Been Implemented

### Staff Portal Features (10 total — fully implemented)
**Founder Portal (4):** Announcements, System Health Monitor, Escalations, Knowledge Base
**Operations Portal (5):** My Activity Log, Quick Search, Escalate to Founder, Shift Notes, SOPs

### UI/UX Features
- Collapsible sidebar (all portals, persistent via localStorage)
- DEV portal switcher in logo (Founder only, desktop + mobile)
- Estate switcher in page header (Beneficiary only, hidden for single estate)
- Path-based rendering (admin vs ops tools)
- Simplified staff menus

### Security
- RBAC hardened to membership-based access control
- Security hardening (16 fixes)
- Passkey authentication, biometric auth

### P0 Features (Mar 8, 2026) — ALL COMPLETED
1. **Pull-to-Refresh** — Touch gesture on mobile triggers page refresh via custom event (`carryon-pull-refresh`). Uses `usePullToRefresh` hook + `PullToRefreshIndicator` component. No npm dependencies.
2. **Native Haptics** — `haptics.light/medium/success/warning/error()` using `navigator.vibrate()`. Integrated into sidebar toggle, mobile menu open, login success. Falls back silently.
3. **Network Status Banner** — Red "No internet connection" banner when offline, green "Back online" on reconnection (auto-hides after 3s). Uses browser `online`/`offline` events.
4. **Force Update Gate** — Checks `GET /api/health` for `min_version` every 5 minutes. Blocks UI with "Update Required" screen if app version is outdated. Currently both at 1.0.0 (not blocking).
5. **Error Reporter** — Global `window.error` + `unhandledrejection` handlers send to `POST /api/errors/report`. ErrorBoundary also reports via `reportError()`. Uses `sendBeacon` for reliability. Dedupes within session.

## Key Files
### P0 Feature Files
- `src/utils/haptics.js` — Haptic feedback utility
- `src/utils/errorReporter.js` — Global error reporter
- `src/components/NetworkStatusBanner.js` — Offline/online banner
- `src/components/ForceUpdateGate.js` — Version check gate
- `src/hooks/usePullToRefresh.js` — Pull-to-refresh hook
- `src/components/PullToRefreshIndicator.js` — Pull indicator UI

### Modified Files
- `App.js` — ForceUpdateGate wrapper, NetworkStatusBanner, initErrorReporter, reportError in ErrorBoundary
- `DashboardLayout.js` — PullToRefreshIndicator + usePullToRefresh
- `Sidebar.js` — haptics.light() on toggle
- `MobileNav.js` — haptics.light() on menu open
- `LoginPage.js` — haptics.success() on login
- `index.css` — slideDown keyframe animation

### Backend
- `routes/errors.py` — POST /api/errors/report (pre-existing)
- `server.py` — GET /api/health returns version + min_version (pre-existing)
- `routes/staff_tools.py` — All 10 staff tool endpoints

## Prioritized Backlog

### P1 — Finalize Share Extension Setup
- iOS/Xcode manual configuration guidance for native Share Extension

### P2 — Twilio SMS OTP
- Pending user's A2P 10DLC approval

## Key Credentials
- Founder: info@carryon.us / Demo1234!
- Benefactor: fulltest@test.com / Password.123
