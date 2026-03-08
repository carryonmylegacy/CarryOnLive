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

## What's Been Implemented (All P0 Complete)

### Multi-Tier Operator System
- Founder→Manager→Worker hierarchy with full CRUD + edit + password reset
- Role badges (Manager=crown/gold, Worker=wrench/blue)
- Separate entry points, unique workspaces at /ops
- Managers see Ops Dashboard + Team nav items

### Amber Alert Emergency System
- Full-screen overlay with repeating EAS-style alert tone (853Hz + 960Hz)
- Continuous vibration pattern — repeats until "Acknowledge Alert" clicked
- Triggers: Death cert upload, P1 emergency, transition changes
- Fires to Founder + ALL Managers + ALL Workers

### "I'm Still Alive" Emergency Flow
- POST /api/support/p1-emergency — Creates P1 support thread, Amber Alert to all staff
- Sealed account screen Live Chat → P1 emergency auto-trigger
- Support page auto-triggers from URL params ?priority=p1&reason=X

### Push Notification System (Complete)
- Dual delivery: In-app (MongoDB) + Web Push (VAPID)
- Notification Bell in sidebar with unread badge + panel
- **All triggers wired:**
  - Death cert upload → Security alert to benefactor + Amber Alert to all staff
  - Transition approval → Beneficiary notifications + staff notification
  - DTS task creation → All staff notification
  - DTS task assignment → Assigned operator notification
  - Support messages → In-app to recipients
  - Operator create/delete by manager → Founder notification
  - P1 emergency → Amber Alert to all staff
  - Beneficiary invitation accepted → Benefactor notification
  - New user signup → Founder notification
  - Document upload → Beneficiary notifications with doc type category

### DTS Workflow (Complete)
- Task assignment UI: Operator select dropdown in task detail view
- Assigned operator shown as green badge on task cards in list view
- Status flow: submitted → quoted → approved → ready → executed → destroyed
- Quote creation with line items
- Task assignment: POST /api/dts/tasks/{id}/assign (Founder + Manager only)

### Operator Activity Dashboard
- GET /api/ops/dashboard — Real-time metrics (Founder + Manager only)
- Work Queues: DTS, Support, TVT, Verifications, Escalations
- Team Activity: Per-operator online status, tasks, completion rate, 24h actions
- Recent Shift Notes
- Default view for Managers, tab for Founder

### Sealed Account Screen
- Transitioned benefactor login → locked screen with P1 Contact Support
- Live Chat, Email, Phone — P1 Contact Settings editable by Founder

### Earlier Features
- iOS-style notification UI, PWA features (haptics, pull-to-refresh, network banner, force update, error reporter)
- Staff Portal tools (Announcements, System Health, Escalations, Knowledge Base, My Activity, Quick Search, Shift Notes, SOPs)
- AES-256-GCM encryption, membership-based access control

## Prioritized Backlog

### P1 — Milestone Message Automation (PLACEHOLDER)
- Automated: Beneficiary Milestone Notification → System searches estate → Delivers
- Human oversight: CarryOn Worker notified, reviews automated match before delivery
- Build after this big build phase

### P1 — Share Extension Setup
- iOS/Xcode manual configuration guidance

### P2 — Twilio SMS OTP
- Pending A2P 10DLC approval

### P2 — Remaining notification triggers (nice-to-have)
- Subscription expiring / payment failed → benefactor
- System health alert (error spike) → founder

## Key Credentials
- Founder: info@carryon.us / Demo1234!
- Benefactor: fulltest@test.com / Password.123
- Test Manager: ops_manager_1 / Manager123!
- Test Worker: ops_worker_1 / Worker123!
