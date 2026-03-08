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
- DO NOT modify yarn.lock
- PATH-BASED UI RENDERING for staff portals
- OPERATOR HIERARCHY: Founder→Manager→Worker
- Membership-based access control, estate isolation
- Soft-delete standard

## Implemented Features (All Tested)

### Milestone Message Automation (Mar 8, 2026)
- **Flow:** Beneficiary reports milestone → System searches estate for matching messages → Creates pending delivery records
- **Human oversight:** Workers review automated matches before delivery via Milestones tab
- **Approve:** Delivers message to beneficiary + sends notification
- **Reject:** Message NOT delivered
- **Context:** Workers can see ALL estate messages to verify correct match
- **Notifications:** All staff notified when matches found; beneficiary notified on approval
- **Endpoints:** GET /api/milestones/deliveries, /stats, /{id}, POST /{id}/review

### Multi-Tier Operator System
- Founder→Manager→Worker with CRUD, edit, password reset

### Amber Alert Emergency System
- Full-screen overlay, EAS tone (853Hz+960Hz), continuous vibration, repeats until acknowledged

### "I'm Still Alive" Emergency Flow
- P1 emergency thread, sealed account screen, auto-trigger from URL params

### Push Notification System (Complete)
- Dual delivery (in-app + Web Push), all triggers wired

### DTS Workflow (Complete)
- Task assignment UI, status flow, quote creation

### Operator Activity Dashboard
- Real-time work queues, team activity, completion rates

### Sealed Account Screen
- P1 Contact Support (chat, email, phone)

## Prioritized Backlog

### P1 — Share Extension Setup (iOS/Xcode)
### P2 — Twilio SMS OTP (pending A2P 10DLC)
### P2 — Subscription expiring / health alert notifications

## Key Credentials
- Founder: info@carryon.us / Demo1234!
- Benefactor: fulltest@test.com / Password.123
- Test Manager: ops_manager_1 / Manager123!
- Test Worker: ops_worker_1 / Worker123!
