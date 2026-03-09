# CarryOn Platform - Product Requirements Document

## Original Problem Statement
Multi-portal estate planning platform for Benefactor, Beneficiary, Founder (admin), and Operator users, with strong estate-planning workflows, security controls, mobile-first UX, and operational visibility.

## Core Architecture
- Frontend: React (CRA) with route-based portal navigation
- Backend: FastAPI
- Database: MongoDB
- Notifications: in-app + web push + Amber Alert escalation
- Mobile shell: Capacitor / PWA-friendly UI patterns
- Critical API base usage: `process.env.REACT_APP_BACKEND_URL` on frontend, `MONGO_URL` + `DB_NAME` on backend

## Critical Invariants
- Do not modify `yarn.lock`
- Preserve path-based UI rendering for portal navigation
- Preserve operator hierarchy: Founder → Manager → Team Member
- Backend/API access must stay under `/api`
- Mongo responses must avoid leaking `_id`

## Implemented Features

### Multi-Tier Operator System
- Founder → Manager → Team Member hierarchy with CRUD, edit, and password reset support
- User-facing label standardized to “Team Member” while backend keeps `worker`
- DEV switcher supports instant access to benefactor, beneficiary, founder, and operator accounts

### Alerts, Notifications, and Sealed Accounts
- Priority-based notification system with P1 Amber Alert escalation
- Full-screen emergency overlay with audio + vibration acknowledgement flow
- Sealed deceased-benefactor account screen with configurable P1 support contact options

### Core Estate Workflows
- DTS assignment workflow and operator work queues
- Milestone delivery review workflow for human approval
- Password reset and password change flows
- Beneficiary management, permissions, invitations, and primary designation controls

### UI / UX Modernization
- Persistent sidebar + floating mobile glass navigation
- Improved admin / ops portal organization and spacing
- Numerous layout refinements across benefactor and operator flows

### 2026-03-09 Update — Route-Based Edit Flow Re-Architecture
- Replaced the broken edit-modal pattern for **Beneficiaries** with a dedicated route: `/beneficiaries/:beneficiaryId/edit`
- Replaced the broken edit-modal pattern for **Milestone Messages** with a dedicated route: `/messages/:messageId/edit`
- Beneficiaries list edit action now routes into a full-page editor instead of opening the previous dialog
- Messages list edit action now routes into a full-page editor instead of opening the previous dialog
- New edit pages preserve existing backend save behavior while avoiding the old fixed-overlay modal flow that was causing iOS/PWA usability failures
- Beneficiary editor uses direct device photo selection instead of nesting the user inside the old edit modal workflow

### 2026-03-09 Update — Housekeeping Improvements
- Added protected env fallback scan for `REACT_APP_BACKEND_URL`, `MONGO_URL`, and `DB_NAME`
- Added recent backend log scan for runtime error detection
- Added route-editor wiring audit so future regressions back to the broken modal pattern are flagged automatically

## Current Verification Status
- Route-based Beneficiary edit flow: verified by smoke test + testing agent
- Route-based Milestone Message edit flow: verified by smoke test + testing agent
- Backend edit endpoints for both flows: verified by backend smoke testing
- iOS PWA manual verification by user: still recommended because the original bug was device-specific

## Prioritized Backlog

### P0
- User-side manual validation on actual iOS PWA / native shell for the two reworked edit flows

### P1
- Twilio SMS OTP integration remains blocked on user-side Twilio A2P approval
- Share Extension finalization remains blocked on manual Xcode / App Store Connect steps

### P2
- Review existing warnings from housekeeping audit:
  - potential plaintext password scan matches requiring manual review
  - soft-delete review for hard delete usage
  - CORS wildcard verification in middleware
- Do **not** reintroduce subscription / health scheduler work that was previously reverted

## Key Credentials
- Founder: `info@carryon.us` / `Demo1234!`
- Benefactor: `fulltest@test.com` / `Password.123`
- Manager: `ops_manager_1` / `Manager123!`
- Team Member: `ops_worker_1` / `Worker123!`

## Key Files
- `/app/frontend/src/pages/BeneficiariesPage.js`
- `/app/frontend/src/pages/MessagesPage.js`
- `/app/frontend/src/pages/EditBeneficiaryPage.js`
- `/app/frontend/src/pages/EditMilestoneMessagePage.js`
- `/app/frontend/src/App.js`
- `/app/housekeeping.sh`
