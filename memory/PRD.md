# CarryOn Platform - Product Requirements Document

## Original Problem Statement
Multi-portal estate planning platform with four distinct roles: Benefactor, Beneficiary, Founder (admin), and Operator. The platform manages estate documents, milestone messages, beneficiary management, and operational workflows.

## Core Architecture
- **Frontend:** React (CRA) with Shadcn UI components
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Roles:** Benefactor, Beneficiary, Founder (admin), Operator
- **Notification System:** Custom iOS-style slide-in notifications (replaced Sonner)

## Critical Invariants
- **ONE-WAY CHECK VALVE:** A beneficiary can NEVER access the benefactor account.
- **Membership-Based Access:** Backend checks estate relationship, NOT user role, for data access.
- **Estate Isolation:** Data is fully siloed per estate.
- **DO NOT modify yarn.lock** — caused production crashes.
- **Soft-delete standard** for all operational data deletions.
- **PATH-BASED UI RENDERING:** Staff portal UI depends on URL path (/admin vs /ops), NOT user role.

## What's Been Implemented

### Notification System (Mar 8, 2026)
- **iOS-style slide-in notifications** replacing old Sonner toasts
- Slide in from top, glass-morphism background, auto-dismiss after 4s
- Swipeable up to dismiss, quick double vibrate
- Types: error (red), success (green), info (blue), warning (yellow), push (gold), critical (dark red)
- `notify.push(title, message)` for push-style notifications
- `notify.critical(message)` for 8-second persistent alerts
- Action buttons supported via `options.action = { label, onClick }`

### P0 Features (Mar 8, 2026)
1. **Pull-to-Refresh** — Touch gesture + visual indicator
2. **Native Haptics** — `navigator.vibrate()` on key interactions
3. **Network Status Banner** — Red offline / green reconnection
4. **Force Update Gate** — Checks `/api/health` min_version
5. **Error Reporter** — Global error handlers → `POST /api/errors/report`

### Staff Portal Features (10 total)
**Founder (4):** Announcements, System Health, Escalations, Knowledge Base
**Operations (5):** My Activity, Quick Search, Escalate, Shift Notes, SOPs

### Infrastructure
- Collapsible sidebar, DEV portal switcher, estate switcher relocation
- RBAC hardened to membership-based access
- Security hardening (16 fixes), passkey auth, biometric auth

## Prioritized Backlog — NEXT FORK

### P0 — Push Notification Events (APPROVED BY USER)

**Benefactor notifications:**
- Beneficiary accepted their invitation
- Beneficiary uploaded a document (e.g., death certificate) — **SECURITY ALERT with "I'm Still Alive — Emergency Contact" button** → routes to P1 emergency support chat
- DTS estimate received and awaiting approval
- Founder message received (via Support Chat)
- System update push (platform announcements)
- Transition status changed (initiated, verified, completed) — **SECURITY ALERT with "I'm Still Alive — Emergency Contact" button** → routes to P1 emergency support chat
- Support reply received
- Subscription expiring / payment failed

**Beneficiary notifications:**
- Invited to an estate (new invitation)
- New milestone message unlocked
- Transition initiated on your estate
- New document shared with you (**specify doc type** in notification, e.g., "New POA uploaded" or "Healthcare Directive shared")
- Support reply received

**Founder notifications:**
- New operator escalation submitted
- New support ticket created
- New user signup
- Transition initiated (any estate)
- System health alert (error spike)
- Subscription payment received
- New Operator enrolled or deleted by Operations Manager

**Operator notifications:**
- New support ticket assigned
- Escalation response from founder
- Shift note left by another operator
- New DTS request from a benefactor (new task submitted by benefactor)
- New DTS task assigned (post-transition, ready for execution by operator)
- Verification request submitted
- High-priority support ticket flagged

### P0 — "I'm Still Alive" Emergency Flow
- Death certificate upload and transition status change notifications include a prominent button
- Button deep-links to Priority 1 emergency support chat thread
- P1 thread immediately alerts ALL operators with high-priority flagging
- Benefactor has window from death cert upload through verification to halt the process

### P0 — Sealed Account Screen
- When a transitioned benefactor's account is attempted to log in:
  - Dark blue screen, NO menu or buttons visible
  - Glass tile in center: "This account was transitioned on [date/time] and is therefore immutably sealed."
  - "If this was done in error, please click here to send the CarryOn team a priority message."
  - Priority message link → emergency support chat

### P0 — Operator Hierarchy (Manager vs Worker)
- **Operations Manager** — can create/edit/delete worker accounts, sees all assignments, manages shift coverage
- **Operations Worker** — handles assigned tickets, DTS tasks, verification requests, sees only their assignments
- **Founder** always maintains ability to create, edit, and delete ANY account across the entire platform
- Founder creates Operations Manager accounts
- Operations Manager creates/manages Operations Worker accounts
- DTS task assignment, shift notes, escalations flow through hierarchy

### P1 — DTS Process Flow Audit
- Review ALL verbiage, instructions, and process flow in the DTS section
- Ensure all screens and flows are fully functional:
  - Benefactor creates DTS task → submitted
  - DTS team member researches and provides quote with line items → quoted
  - Benefactor reviews quote, approves/rejects items → approved
  - Benefactor sets up payment
  - Transition triggers → task assigned to operator → ready for execution
- "New DTS request from a benefactor" = new task submitted
- "New DTS task assigned" = post-transition, operator receives task for execution

### P1 — Finalize Share Extension Setup
- iOS/Xcode manual configuration guidance

### P2 — Twilio SMS OTP
- Pending A2P 10DLC approval

## Key Files
### Notification System
- `src/components/AppNotification.js` — iOS-style notification system (NotificationContainer + NotificationCard + notify API)
- `src/utils/toast.js` — Routes toast.error/success/info/warning to notify API

### P0 Feature Files
- `src/utils/haptics.js`, `src/utils/errorReporter.js`
- `src/components/NetworkStatusBanner.js`, `src/components/ForceUpdateGate.js`
- `src/hooks/usePullToRefresh.js`, `src/components/PullToRefreshIndicator.js`

### Core Modified Files
- `App.js` — ForceUpdateGate, NetworkStatusBanner, NotificationContainer, initErrorReporter
- `DashboardLayout.js` — PullToRefreshIndicator + usePullToRefresh
- `Sidebar.js` — haptics on toggle
- `MobileNav.js` — haptics on menu open
- `LoginPage.js` — haptics on login success

### Messages System (Milestone Messages — NOT chat)
- Messages = one-way milestone messages from benefactor to beneficiary
- Triggered by events (birthdays, transition, specific dates)
- NO two-way chat between benefactors and beneficiaries
- Only chat: Support Chat (user ↔ CarryOn staff)

### DTS System
- `pages/TrusteePage.js` — Frontend for Digital Trustee Services
- `backend/routes/dts.py` — DTS CRUD, quoting, approval, status management
- Status flow: submitted → quoted → approved → ready
- Types: delivery, account_closure, financial, communication, destruction
- Confidentiality levels: full, partial, timed

## Key Credentials
- Founder: info@carryon.us / Demo1234!
- Benefactor: fulltest@test.com / Password.123
