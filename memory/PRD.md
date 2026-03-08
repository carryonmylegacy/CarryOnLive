# CarryOn Platform - Product Requirements Document

## Original Problem Statement
Multi-portal estate planning platform with four distinct roles: Benefactor, Beneficiary, Founder (admin), and Operator (Manager/Worker). The platform manages estate documents, milestone messages, beneficiary management, and operational workflows.

## Core Architecture
- **Frontend:** React (CRA) with Shadcn UI components
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Roles:** Benefactor, Beneficiary, Founder (admin), Operator (Manager + Worker)
- **Notification System:** Custom iOS-style slide-in notifications + In-app notification storage + Web Push

## Critical Invariants
- **ONE-WAY CHECK VALVE:** A beneficiary can NEVER access the benefactor account.
- **Membership-Based Access:** Backend checks estate relationship, NOT user role, for data access.
- **Estate Isolation:** Data is fully siloed per estate.
- **DO NOT modify yarn.lock** — caused production crashes.
- **Soft-delete standard** for all operational data deletions.
- **PATH-BASED UI RENDERING:** Staff portal UI depends on URL path (/admin vs /ops), NOT user role.
- **OPERATOR HIERARCHY:** Founder→Manager→Worker. Founder creates/edits/deletes all. Managers create/edit/delete workers only.

## What's Been Implemented

### Push Notification System (Mar 8, 2026)
- **Centralized notification service** (`services/notifications.py`) — dual delivery: in-app (MongoDB) + web push (VAPID)
- **In-app notifications API:** GET /api/notifications, POST /api/notifications/{id}/read, POST /api/notifications/read-all, GET /api/notifications/unread-count
- **Notification Bell** in sidebar — polls every 30s, shows badge with unread count, opens panel with notification list
- **Notification triggers wired into:**
  - Death certificate upload → Security alert to benefactor + all staff notification
  - Transition approval → Beneficiary notifications + staff notification
  - DTS task creation → All staff notification
  - DTS task assignment → Assigned operator notification
  - Support messages → In-app notification to recipient(s)
  - Operator create/delete by manager → Founder notification
- **Fire-and-forget pattern:** All triggers use `asyncio.create_task` for non-blocking delivery

### Operator Activity Dashboard (Mar 8, 2026)
- **GET /api/ops/dashboard** — Real-time metrics endpoint (Founder + Manager only)
- **Work Queues:** DTS total/unassigned, Support open/unanswered, TVT pending/reviewing, Verifications, Escalations
- **Team Activity:** Per-operator profiles with online status, tasks assigned/active/completed, completion rate, 24h action count
- **Recent Shift Notes:** Last 24h shift notes with author and timestamp
- **Auto-refresh:** Dashboard polls every 30s
- **Access:** Dashboard is the default view for Managers at /ops, available as tab for Founder at /admin/ops-dashboard

### DTS Task Assignment (Mar 8, 2026)
- **POST /api/dts/tasks/{id}/assign** — Assign DTS tasks to operators
- Founder and Managers can assign; Workers cannot
- Assigned operator receives notification
- `assigned_to`, `assigned_by`, `assigned_at` fields on DTS tasks

### Multi-Tier Operator System (Mar 8, 2026)
- **Operator Hierarchy:** Founder (admin) → Operations Manager → Operations Worker
- **Founder:** Create/edit/delete any operator
- **Manager:** Create/edit/delete workers only. Cannot manage managers.
- **Architecture:** Unlimited future accounts. Current soft limits: 2 managers, 10 workers
- **Separate entry points:** Each operator has unique username/password, workspace at /ops
- **Sidebar:** Managers see "Ops Dashboard" + "Team" nav items. Label shows "OPS MANAGER"
- **OperatorsTab:** Manager/Worker sections with role badges (crown/wrench icons)

### Sealed Account Screen (Mar 8, 2026)
- **Backend:** Login checks if benefactor's estate is transitioned, returns `{sealed: true}`
- **Frontend:** Full-screen locked screen with P1 Contact Support (chat, email, phone)
- **P1 Contact Settings:** Founder-only settings in admin portal. Public API for sealed screen.
- **Defaults:** email=founder@carryon.us, phone=(808) 585-1156, chat_enabled=true

### Earlier Features
- iOS-style slide-in notification UI (replaced Sonner)
- PWA features: Pull-to-Refresh, Haptics, Network Status Banner, Force Update Gate, Error Reporter
- Staff Portal Features: Announcements, System Health, Escalations, Knowledge Base, My Activity, Quick Search, Shift Notes, SOPs
- AES-256-GCM encryption, membership-based access control

## Prioritized Backlog

### P0 — "I'm Still Alive" Emergency Flow (PARTIALLY DONE)
- Death cert upload notification fires with security alert ✅
- Need: Prominent "I'm Still Alive — Emergency Contact" button in benefactor notification
- Need: P1 thread in support chat immediately alerts ALL operators
- Need: Benefactor window from death cert upload through verification to halt the process

### P0 — DTS Workflow Full Implementation (PARTIALLY DONE)
- Task assignment for Managers ✅
- All staff see DTS tasks ✅
- Need: Review all verbiage/UI flows end-to-end
- Need: DTS task assignment UI in frontend DTSTab
- Full status flow: submitted → quoted → approved → ready → executed → destroyed

### P0 — Remaining Notification Triggers
- Beneficiary invitation accepted → benefactor notification
- Subscription expiring / payment failed → benefactor notification
- New user signup → founder notification
- System health alert → founder notification

### P1 — Milestone Message Automation (PLACEHOLDER)
- Automated: Beneficiary triggers Milestone Notification → System searches estate → Delivers to correct beneficiary
- Human oversight: CarryOn Worker notified, reviews automated match before delivery
- Build AFTER this big build phase

### P1 — Share Extension Setup
### P2 — Twilio SMS OTP

## Key Files

### Notification System
- `backend/services/notifications.py` — Centralized service (in-app + push)
- `backend/routes/notifications.py` — CRUD endpoints
- `frontend/src/components/NotificationBell.js` — Sidebar bell + panel

### Operator Dashboard
- `backend/routes/ops_dashboard.py` — Dashboard API
- `frontend/src/components/admin/OpsDashboardTab.js` — Dashboard UI

### Multi-Tier Operators
- `backend/routes/operators.py` — CRUD + P1 settings + audit trail
- `frontend/src/components/admin/OperatorsTab.js` — Manager/Worker hierarchy

### Sealed Account
- `frontend/src/components/SealedAccountScreen.js` — Locked screen
- `frontend/src/components/admin/P1ContactSettingsTab.js` — P1 settings

### DTS
- `backend/routes/dts.py` — DTS CRUD + task assignment
- `frontend/src/pages/TrusteePage.js` — DTS frontend

## Key Credentials
- Founder: info@carryon.us / Demo1234!
- Benefactor: fulltest@test.com / Password.123
- Test Manager: ops_manager_1 / Manager123!
- Test Worker: ops_worker_1 / Worker123!
