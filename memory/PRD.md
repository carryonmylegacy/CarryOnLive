# CarryOn Platform - Product Requirements Document

## Original Problem Statement
Multi-portal estate planning platform with four distinct roles: Benefactor, Beneficiary, Founder (admin), and Operator (Manager/Worker). The platform manages estate documents, milestone messages, beneficiary management, and operational workflows.

## Core Architecture
- **Frontend:** React (CRA) with Shadcn UI components
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Roles:** Benefactor, Beneficiary, Founder (admin), Operator (Manager + Worker)
- **Notification System:** Custom iOS-style slide-in notifications (replaced Sonner)

## Critical Invariants
- **ONE-WAY CHECK VALVE:** A beneficiary can NEVER access the benefactor account.
- **Membership-Based Access:** Backend checks estate relationship, NOT user role, for data access.
- **Estate Isolation:** Data is fully siloed per estate.
- **DO NOT modify yarn.lock** — caused production crashes.
- **Soft-delete standard** for all operational data deletions.
- **PATH-BASED UI RENDERING:** Staff portal UI depends on URL path (/admin vs /ops), NOT user role.
- **OPERATOR HIERARCHY:** Founder→Manager→Worker. Founder creates/edits/deletes all. Managers create/edit/delete workers only.

## What's Been Implemented

### Multi-Tier Operator System (Mar 8, 2026)
- **Operator Hierarchy:** Founder (admin) → Operations Manager → Operations Worker
- **Founder capabilities:** Create/edit/delete any operator (manager or worker)
- **Manager capabilities:** Create/edit/delete workers only. Cannot create/edit/delete managers.
- **Worker role:** Handles assigned tasks (TVT, DTS, Support, Verifications)
- **Architecture:** Unlimited future accounts supported. Current soft limits: 2 managers, 10 workers
- **Separate entry points:** Each operator has unique username/password, their own workspace at /ops
- **Sidebar:** Managers see "Team" nav item for worker management. Label shows "OPS MANAGER" for managers.
- **OperatorsTab:** Displays Managers section (golden crown) and Workers section (blue wrench) with role badges
- **Edit operator:** Full edit dialog with name, email, phone, title, notes, password reset
- **Delete operator:** Requires password confirmation for security
- **Backend fields:** `operator_role` field on user document ("manager" or "worker"). Legacy operators default to "worker".
- **Auth:** `operator_role` included in /auth/me response and login TokenResponse

### Sealed Account Screen (Mar 8, 2026)
- **When:** A transitioned benefactor tries to log in
- **Backend:** Login checks if benefactor's estate has status="transitioned", returns `{sealed: true, transitioned_at: "..."}`
- **Frontend:** Full-screen dark blue locked screen with glass tile
- **Content:** "This account was transitioned on [date/time] and is therefore immutably sealed."
- **Priority 1 Contact Support:** Three options:
  - Live Chat (links to /support?priority=p1&reason=sealed_account)
  - Email (mailto:founder@carryon.us with pre-filled subject)
  - Phone Call (tel: link to configured number)
- **Back to login** button to return
- **No menu, no navigation** — just the sealed notice and P1 contact

### P1 Contact Settings (Mar 8, 2026)
- **Founder-only settings** in admin portal sidebar
- **Configurable:** Email, phone number, live chat toggle
- **Defaults:** email=founder@carryon.us, phone=(808) 585-1156, chat_enabled=true
- **Phone number restriction:** ONLY shown on sealed account screen, nowhere else
- **Public API:** /api/founder/p1-contact-settings-public (no auth required for sealed screen)
- **Staff API:** /api/founder/p1-contact-settings (GET for staff, PUT for founder only)

### Notification System (Mar 8, 2026)
- **iOS-style slide-in notifications** replacing old Sonner toasts
- Slide in from top, glass-morphism background, auto-dismiss after 4s
- Types: error (red), success (green), info (blue), warning (yellow), push (gold), critical (dark red)

### P0 Features (Mar 8, 2026)
1. **Pull-to-Refresh** — Touch gesture + visual indicator
2. **Native Haptics** — `navigator.vibrate()` on key interactions
3. **Network Status Banner** — Red offline / green reconnection
4. **Force Update Gate** — Checks `/api/health` min_version
5. **Error Reporter** — Global error handlers → `POST /api/errors/report`

### Staff Portal Features
**Founder (5):** Announcements, System Health, Escalations, Knowledge Base, P1 Contact Settings
**Operations (5):** My Activity, Quick Search, Escalate, Shift Notes, SOPs
**Manager-only:** Team management (worker CRUD)

### Infrastructure
- Collapsible sidebar, DEV portal switcher, estate switcher relocation
- RBAC hardened to membership-based access
- Security hardening, passkey auth, biometric auth

## Prioritized Backlog

### P0 — Push Notification Events (APPROVED BY USER)

**Benefactor notifications:**
- Beneficiary accepted their invitation
- Beneficiary uploaded a document (e.g., death certificate) — **SECURITY ALERT with "I'm Still Alive — Emergency Contact" button**
- DTS estimate received and awaiting approval
- Founder message received (via Support Chat)
- System update push (platform announcements)
- Transition status changed — **SECURITY ALERT with "I'm Still Alive — Emergency Contact" button**
- Support reply received
- Subscription expiring / payment failed

**Beneficiary notifications:**
- Invited to an estate (new invitation)
- New milestone message unlocked
- Transition initiated on your estate
- New document shared with you (specify doc type)
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
- New DTS request from a benefactor
- New DTS task assigned
- Verification request submitted
- High-priority support ticket flagged

### P0 — "I'm Still Alive" Emergency Flow
- Death certificate upload and transition status change notifications include a prominent button
- Button deep-links to Priority 1 emergency support chat thread
- P1 thread immediately alerts ALL operators

### P0 — DTS Workflow Full Implementation
- Review all verbiage and process flows
- Task assignment capabilities for Managers
- All TVT, Customer Service, DTS requests visible to all staff (Founder, Managers, Workers)
- Status flow: submitted → quoted → approved → ready → executed → destroyed

### P1 — Milestone Message Automation (PLACEHOLDER)
- Automated workflow: Beneficiary triggers Milestone Notification
- System searches estate for matching Milestone Messages
- Delivers to correct beneficiary on time
- Human oversight: CarryOn Worker notified, reviews automated match before delivery
- **Build AFTER this big build phase**

### P1 — Finalize Share Extension Setup
- iOS/Xcode manual configuration guidance

### P2 — Twilio SMS OTP
- Pending A2P 10DLC approval

## Key Files

### Multi-Tier Operator System
- `backend/routes/operators.py` — Full CRUD for managers/workers + P1 contact settings + audit trail
- `frontend/src/components/admin/OperatorsTab.js` — Manager/Worker hierarchy display
- `frontend/src/components/admin/P1ContactSettingsTab.js` — P1 emergency contact settings
- `frontend/src/components/layout/Sidebar.js` — Role-aware nav (manager gets Team tab)

### Sealed Account Screen
- `frontend/src/components/SealedAccountScreen.js` — Full sealed screen with P1 contact options
- `frontend/src/pages/LoginPage.js` — Handles sealed response from login API
- `frontend/src/contexts/AuthContext.js` — Login function returns sealed flag
- `backend/routes/auth.py` — Checks transitioned estates on benefactor login

### Notification System
- `src/components/AppNotification.js` — iOS-style notification system
- `src/utils/toast.js` — Routes toast.error/success/info/warning to notify API

### Core Files
- `App.js` — ForceUpdateGate, NetworkStatusBanner, NotificationContainer, routing
- `backend/models.py` — UserResponse with operator_role, UserLogin accepts non-email usernames

### DTS System
- `pages/TrusteePage.js` — Frontend for Digital Trustee Services
- `backend/routes/dts.py` — DTS CRUD, quoting, approval, status management

## Key Credentials
- Founder: info@carryon.us / Demo1234!
- Benefactor: fulltest@test.com / Password.123
- Test Manager: ops_manager_1 / Manager123!
- Test Worker: ops_worker_1 / Worker123!
