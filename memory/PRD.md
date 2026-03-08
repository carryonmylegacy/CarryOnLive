# CarryOn Platform - Product Requirements Document

## Original Problem Statement
Multi-portal estate planning platform with four distinct roles: Benefactor, Beneficiary, Founder (admin), and Operator. The platform manages estate documents, milestone messages, beneficiary management, and operational workflows.

## Core Architecture
- **Frontend:** React (CRA) with Shadcn UI components
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Roles:** Benefactor, Beneficiary, Founder (admin), Operator

## Critical Invariants
- **ONE-WAY CHECK VALVE:** A beneficiary can NEVER access the benefactor account that designated them. The relationship flows one way only — benefactor grants downstream to beneficiary, never reverse. A user who is also a benefactor only accesses their OWN benefactor account.
- **Membership-Based Access:** Backend checks actual estate relationship (owner, beneficiary, admin), NOT user role, for data access. A benefactor who is also a beneficiary of another estate gets read-only beneficiary view of that estate.
- **Estate Isolation:** Data is fully siloed per estate. No information transfers between estates, even for the same user.
- **DO NOT modify yarn.lock carelessly** — caused production crashes previously.
- **Soft-delete is the standard** for all operational data deletions.
- **Do not show UI for features that don't apply** to the current user's state.

## What's Been Implemented

### Prior Sessions
- Full multi-portal platform with role-based access
- Estate management, document vault, milestone messages, beneficiary management
- Guardian AI, DTS, IAC, subscription system, GDPR, passkey auth
- Beneficiary portal with estate switching
- Soft-delete system (backend + frontend)
- Operations Dashboard tiles (auto-refreshing)
- RBAC hardening

### Current Session (Feb 2026)

#### Menu & Navigation Cleanup
- Stripped Operator & Founder sidebar/hamburger menus to Logo + Tools + Theme + Sign Out
- Removed "Beneficiary Portal" link from benefactor sidebar
- Settings page shows only Appearance + Sign Out for staff
- Benefactor/Beneficiary menus untouched
- OTP toggle preserved in Founder portal

#### Collapsible Sidebar
- Toggle between expanded (icon + label) and collapsed (icon only) on desktop
- Persists via localStorage across sessions
- Beta banner becomes Greek beta (beta) icon when collapsed
- All portals supported

#### Estate Switcher Relocation
- Removed estate switcher from sidebar entirely
- Beneficiary: estate selector at top-right of dashboard header (only when 2+ estates)
- Benefactor: EstateSelector already at top-right (hides for single estate)

#### Dev Portal Switcher Relocation
- Moved Portal Switcher into the CarryOn logo icon (sidebar, founder-only)
- Removed floating DEV button overlay from App.js
- Non-admin users cannot trigger the switcher (security enforced)
- Same menu preserved: switch between Benefactor, Beneficiary, Founder, Operations portals
- Fixed dual-role scenario: benefactor who is also a beneficiary can now access beneficiary estates in read-only view
- Updated estates.py (detail + activity endpoints) and messages.py (list, video, voice endpoints) to use membership-based checks

#### 10 New Staff Portal Features (All SOC2 Compliant)

**Founder Portal (4 features):**
1. **Platform Announcements** — Create/deactivate announcements targeted at specific audiences (all, benefactors, beneficiaries, operators). Audit-logged.
2. **System Health Monitor** — Real-time database stats, active sessions, client errors, audit events, queue health. Auto-refreshes every 60s.
3. **Escalations (Founder View)** — View all operator escalations, resolve with notes. Audit-logged.
4. **Knowledge Base** — Create/edit/delete SOPs and procedures, categorized by department. Operators can read.

**Operations Portal (5 features):**
1. **My Activity Log** — Personal audit trail grouped by date, showing all actions with severity levels.
2. **Quick Search** — Universal search across users, support tickets, DTS tasks, verifications.
3. **Escalate to Founder** — Submit issues requiring founder attention with priority levels and related context.
4. **Shift Notes & Handoff** — Leave notes for the next operator, with acknowledge system.
5. **Knowledge Base / SOPs** — Read-only access to founder-created procedures.

## Key Files
- **Backend:** `routes/staff_tools.py` (all new endpoints), `routes/estates.py`, `routes/messages.py`
- **Frontend Tabs:** `components/admin/{AnnouncementsTab,SystemHealthTab,MyActivityTab,QuickSearchTab,EscalationsTab,ShiftNotesTab,KnowledgeBaseTab}.js`
- **Layout:** `components/layout/Sidebar.js`, `DashboardLayout.js`, `MobileNav.js`
- **Pages:** `AdminPage.js` (tab config + rendering), `SettingsPage.js`

## Prioritized Backlog

### P0 - Re-implement Deferred Features
- Pull-to-refresh, native haptics, network status banner, force update gate, error reporter
- Previously rolled back due to yarn.lock crash. Handle Capacitor dependencies carefully.

### P1 - Finalize Share Extension Setup
- Manual Xcode + App Store Connect guidance for iOS Share Extension

### P2 - Twilio SMS OTP
- Pending user's A2P 10DLC approval

## Key Credentials
- Founder: admin@carryon.com / Demo1234!
- Benefactor: fulltest@test.com / Password.123
- Operator: Created via Founder Portal > Operators tab
