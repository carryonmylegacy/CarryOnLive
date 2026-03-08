# CarryOn Platform - Product Requirements Document

## Original Problem Statement
Multi-portal estate planning platform: Benefactor, Beneficiary, Founder (admin), Operator (Manager + Team Member).

## Core Architecture
- React (CRA) + FastAPI + MongoDB
- Notification: In-app + Web Push + Amber Alert
- UX Label: "Team Member" (backend: "worker")

## Critical Invariants
- DO NOT modify yarn.lock
- PATH-BASED UI RENDERING for staff portals
- OPERATOR HIERARCHY: Founder→Manager→Team Member

## Implemented Features (All Tested)

### Multi-Tier Operator System
- Founder→Manager→Team Member with CRUD, edit, password reset
- UX: "Team Member" everywhere (code: "worker")
- DEV Portal Switcher shows all operator accounts for instant switching
- Admin impersonation: POST /api/founder/operator-dev-login

### Amber Alert + "I'm Still Alive" Emergency
- EAS tone (853Hz+960Hz), vibration, full-screen overlay until acknowledged
- P1 emergency thread, sealed account screen

### Push Notification System (All Triggers)
- In-app + Web Push, Notification Bell in sidebar
- Triggers: death cert, transition, DTS, support, operator CRUD, invitations, signups, doc uploads

### DTS Workflow
- Task assignment UI, status flow, quote creation

### Operator Activity Dashboard
- Real-time work queues, team activity, completion rates

### Milestone Message Automation
- Beneficiary reports → System finds matches → Worker reviews → Approve/Reject

### Sealed Account Screen
- P1 Contact Support (chat, email, phone), Founder-configurable

## Backlog
- P1: Share Extension Setup
- P2: Twilio SMS OTP
- P2: Subscription/health alert notifications

## Key Credentials
- Founder: info@carryon.us / Demo1234!
- Benefactor: fulltest@test.com / Password.123
- Manager: ops_manager_1 / Manager123!
- Team Member: ops_worker_1 / Worker123!
