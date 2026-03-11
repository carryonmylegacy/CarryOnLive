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
- **Auth:** JWT-based with OTP verification

## What's Been Implemented

### Session: March 11, 2026
- **Notification Panel Positioning:** Panel now opens upward from the notification bell button instead of downward. Uses `bottom: calc(100% + 8px)` absolute positioning. Responsive: aligns right on mobile (Sheet), left on desktop (sidebar).
- **DEV Portal Switcher Fix:** Fixed `isActive` logic for `ops_view` to require `user?.role === 'admin'`, preventing Operations Portal from being highlighted when logged in as an operator. Fixed in both Sidebar.js and MobileNav.js.
- **Mobile Dialog Scroll Fix:** Enhanced CSS rules for Radix Dialog on mobile/PWA to enable touch scrolling inside modals. Added `touch-action: pan-y`, `-webkit-overflow-scrolling: touch`, and `overscroll-behavior: contain` rules.

### Previous Sessions
- Major sidebar & navigation redesign (desktop + mobile unified)
- Ops Portal Users tab bug fix
- Portal pill labels/colors fix
- "Legacy" to "Estate Plan" terminology overhaul
- Deprecated services removal (Will/Trust Wizard & Eternal Echo)
- Default last-viewed portal feature (localStorage)
- Backend housekeeping (MongoDB index fix, null DOB fix)
- Content overhaul across frontend and backend

## Prioritized Backlog

### P1
- Finalize Share Extension Setup (Xcode, see /app/memory/SHARE_EXTENSION_SETUP.md)
- Twilio SMS OTP Integration (blocked on A2P 10DLC approval)

### P2
- ESLint code cleanup (non-critical warnings)
- Review beneficiary settings page for race condition (one-time flash glitch reported)

## Key Accounts
- Founder/Admin: info@carryon.us / Demo1234!
- Test Benefactor: fulltest@test.com / Password.123

## Key Files
- frontend/src/components/NotificationBell.js
- frontend/src/components/layout/Sidebar.js
- frontend/src/components/layout/MobileNav.js
- frontend/src/components/admin/OperatorsTab.js
- frontend/src/index.css
- frontend/src/components/ui/dialog.jsx
- frontend/src/components/ui/sheet.jsx

## Deployment Notes
- Backend changes deploy immediately via Railway (affects live app + TestFlight)
- Frontend changes deploy via Vercel (does NOT update TestFlight app)
- TestFlight builds managed separately via CodeMagic
