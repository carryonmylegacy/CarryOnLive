# CarryOn Platform - Product Requirements Document

## Original Problem Statement
Multi-portal estate planning platform with four distinct roles: Benefactor, Beneficiary, Founder (admin), and Operator (Manager/Worker). The platform manages estate documents, milestone messages, beneficiary management, and operational workflows.

## Core Architecture
- **Frontend:** React (CRA) with Shadcn UI components
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Roles:** Benefactor, Beneficiary, Founder (admin), Operator (Manager + Worker)
- **Notification System:** In-app (MongoDB) + Web Push (VAPID) + Amber Alert (critical security events)

## Critical Invariants
- **ONE-WAY CHECK VALVE:** A beneficiary can NEVER access the benefactor account.
- **Membership-Based Access:** Backend checks estate relationship, NOT user role, for data access.
- **Estate Isolation:** Data is fully siloed per estate.
- **DO NOT modify yarn.lock** — caused production crashes.
- **Soft-delete standard** for all operational data deletions.
- **PATH-BASED UI RENDERING:** Staff portal UI depends on URL path (/admin vs /ops), NOT user role.
- **OPERATOR HIERARCHY:** Founder→Manager→Worker.

## What's Been Implemented

### Amber Alert Emergency System (Mar 8, 2026)
- **Amber Alert overlay:** Full-screen, impossible-to-dismiss emergency notification
- **Triggers:** Death certificate upload, P1 emergency ("I'm Still Alive"), transition changes
- **Sound:** Repeating Emergency Alert System tone (853Hz + 960Hz via Web Audio API) — plays until acknowledged
- **Vibration:** Continuous pattern (300ms on, 200ms off) — repeats until acknowledged
- **Visual:** Dark overlay (92% opacity), pulsing red border, scanning line effect, red shield icon
- **Must acknowledge:** Only "Acknowledge Alert" button dismisses the overlay
- **"View Details"** link navigates to relevant page
- **Polling:** AmberAlertProvider checks every 10s for critical security_alert notifications

### "I'm Still Alive" Emergency Flow (Mar 8, 2026)
- **POST /api/support/p1-emergency** — Creates P1 support thread, alerts ALL staff with Amber Alert
- **Reasons:** sealed_account, death_cert_error, transition_error
- **Benefactor notification:** Security alert with link to /support?priority=p1&reason=...
- **Support page auto-trigger:** URL params ?priority=p1&reason=X auto-fires the P1 emergency
- **Sealed account screen:** Live Chat button links directly to P1 emergency
- **All staff see:** P1 chat threads visible to Founder + all Managers + all Workers

### Push Notification System (Mar 8, 2026)
- **Dual delivery:** In-app (MongoDB) + Web Push (VAPID)
- **Notification Bell:** Sidebar component, polls every 30s, unread badge, click-to-open panel
- **Mark read:** Individual or mark-all-read
- **Triggers wired:**
  - Death cert upload → Security alert to benefactor + Amber Alert to all staff
  - Transition approval → Beneficiary notifications + staff notification
  - DTS task creation → All staff notification
  - DTS task assignment → Assigned operator notification
  - Support messages → In-app to recipient(s)
  - Operator create/delete by manager → Founder notification
  - P1 emergency → Amber Alert to all staff

### Operator Activity Dashboard (Mar 8, 2026)
- **GET /api/ops/dashboard** — Real-time metrics (Founder + Manager only)
- **Work Queues:** DTS, Support, TVT, Verifications, Escalations counts
- **Team Activity:** Per-operator online status, tasks, completion rate, 24h actions
- **Recent Shift Notes:** Last 24h
- **Auto-refresh:** 30s polling
- **Access:** Default view for Managers at /ops, tab for Founder at /admin/ops-dashboard

### DTS Task Assignment (Mar 8, 2026)
- **POST /api/dts/tasks/{id}/assign** — Founder + Managers can assign
- **assigned_to/assigned_by/assigned_at** fields on DTS tasks

### Multi-Tier Operator System (Mar 8, 2026)
- Founder → Manager → Worker hierarchy with full CRUD
- Edit operator with password reset capability
- Role badges (Manager=crown/gold, Worker=wrench/blue)

### Sealed Account Screen (Mar 8, 2026)
- Transitioned benefactor login → locked screen with P1 Contact Support
- Live Chat, Email (founder@carryon.us), Phone ((808) 585-1156)
- P1 Contact Settings in Founder portal (editable)

### Earlier Features
- iOS-style notification UI, PWA features, Staff Portal tools
- AES-256-GCM encryption, membership-based access control

## Prioritized Backlog

### P0 — DTS Workflow Full Implementation
- Add task assignment UI in frontend DTSTab
- Review all verbiage/UI flows end-to-end
- Full status flow: submitted → quoted → approved → ready → executed → destroyed

### P0 — Remaining Notification Triggers
- Beneficiary invitation accepted → benefactor notification
- Subscription expiring / payment failed → benefactor notification
- New user signup → founder notification
- System health alert (error spike) → founder notification
- New document shared with beneficiary → beneficiary notification (specify doc type)

### P1 — Milestone Message Automation (PLACEHOLDER)
- Automated: Beneficiary Milestone Notification → System searches → Delivers
- Human oversight: Worker reviews automated match before delivery

### P1 — Share Extension Setup
### P2 — Twilio SMS OTP

## Key Files

### Amber Alert + Emergency
- `frontend/src/components/AmberAlert.js` — Full overlay with sound/vibration
- `backend/routes/support.py` — P1 emergency endpoint
- `backend/routes/transition.py` — Death cert upload triggers

### Notification System
- `backend/services/notifications.py` — Centralized service
- `backend/routes/notifications.py` — CRUD endpoints
- `frontend/src/components/NotificationBell.js` — Bell + panel

### Operator Dashboard
- `backend/routes/ops_dashboard.py` — Dashboard API
- `frontend/src/components/admin/OpsDashboardTab.js` — Dashboard UI

### Operator Management
- `backend/routes/operators.py` — CRUD + P1 settings
- `frontend/src/components/admin/OperatorsTab.js` — Manager/Worker hierarchy

### Sealed Account
- `frontend/src/components/SealedAccountScreen.js` — Locked screen
- `frontend/src/components/admin/P1ContactSettingsTab.js` — P1 settings

## Key Credentials
- Founder: info@carryon.us / Demo1234!
- Benefactor: fulltest@test.com / Password.123
- Test Manager: ops_manager_1 / Manager123!
- Test Worker: ops_worker_1 / Worker123!
