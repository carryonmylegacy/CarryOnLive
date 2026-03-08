# CarryOn Platform - Product Requirements Document

## Original Problem Statement
Multi-portal estate planning platform with four distinct roles: Benefactor, Beneficiary, Founder (admin), and Operator. The platform manages estate documents, milestone messages, beneficiary management, and operational workflows.

## Core Architecture
- **Frontend:** React (CRA) with Shadcn UI components
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Roles:** Benefactor, Beneficiary, Founder (admin), Operator

## What's Been Implemented

### Session 1-N (Prior work)
- Full multi-portal platform with role-based access
- Estate management, document vault, milestone messages, beneficiary management
- Guardian AI, DTS (Designated Trustee Services), IAC (Immediate Action Checklist)
- Subscription system, GDPR compliance, passkey auth
- Beneficiary portal with estate switching

### Recent Session - Operations Portal Overhaul
- **Portal Menu Cleanup:** Role-specific navigation across all 4 portals
- **Soft-Delete System:** Backend + Frontend for all operational data (support, DTS, TVT, verifications)
- **Operations Dashboard Tiles:** Auto-refreshing status tiles for work queues
- **RBAC Hardening:** Operator access controls, founder-only actions protected

### Latest Session (Feb 2026) - Staff Menu Simplification
- **Operator & Founder menus:** Stripped to Logo + OTP toggle (Founder only) + Theme toggle + Sign Out
- **Settings page:** Staff see only Appearance + Sign Out; Benefactors/Beneficiaries see full settings
- **Benefactor/Beneficiary menus:** Untouched
- **Files modified:** Sidebar.js, MobileNav.js, SettingsPage.js

## Prioritized Backlog

### P0 - Re-implement Deferred Features
- Pull-to-refresh, native haptics, network status banner, force update gate, error reporter
- Previously rolled back due to yarn.lock production crash
- CAUTION: Must handle Capacitor dependencies carefully

### P1 - Finalize Share Extension Setup
- Manual Xcode + App Store Connect configuration guidance for iOS Share Extension

### P2 - Twilio SMS OTP
- Pending user's A2P 10DLC approval from Twilio

## Critical Notes
- **ONE-WAY CHECK VALVE (CORE INVARIANT):** A beneficiary can NEVER access the benefactor account that designated them. The relationship flows one way only — benefactor grants access downstream to beneficiary, never the reverse. A user who happens to also be a benefactor only accesses their OWN benefactor account. This is a non-negotiable security boundary of the platform kernel.
- DO NOT modify yarn.lock carelessly (caused production crashes previously)
- Soft-delete is the standard for all operational data deletions
- Founder = superuser (admin role), Operator = employee with limited portal (/ops)
- All backend routes prefixed with /api
- Do not show UI elements for features that don't apply to the current user's state (e.g., no "Beneficiary Portal" link unless the user is actually a beneficiary of another estate)

## Key Credentials
- Founder: info@carryon.us / Demo1234!
- Benefactor: fulltest@test.com / Password.123
- Operator: Created via Founder Portal > Operators tab
