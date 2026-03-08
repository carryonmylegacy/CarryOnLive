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
- **PATH-BASED UI RENDERING:** For staff portals, UI variation depends on the URL path (/admin vs /ops), NOT just the user's role. A founder viewing /ops sees operator tools.

## What's Been Implemented

### Prior Sessions
- Full multi-portal platform with role-based access
- Estate management, document vault, milestone messages, beneficiary management
- Guardian AI, DTS, IAC, subscription system, GDPR, passkey auth
- Beneficiary portal with estate switching
- Soft-delete system (backend + frontend)
- Operations Dashboard tiles (auto-refreshing)
- RBAC hardening
- Security hardening (16 fixes), 5 enhancement features
- Pre-App Store refinements

### Current Session (Mar 8, 2026)

#### P0: Mobile/PWA Verification - COMPLETED
- Verified all 10 new staff tools work on mobile viewport (hamburger menu + bottom nav)
- Verified DEV portal switcher works from mobile logo tap
- Verified correct path-based rendering when admin views ops portal on mobile
- Verified desktop sidebar shows correct tools per portal
- Backend: 11/11 API tests passed (100%)
- Frontend: All features working correctly (100%)
- Testing agent confirmed: no issues found

### Previous Session (Feb-Mar 2026)

#### Menu & Navigation Cleanup
- Stripped Operator & Founder sidebar/hamburger menus to Logo + Tools + Theme + Sign Out
- Removed "Beneficiary Portal" link from benefactor sidebar
- Settings page shows only Appearance + Sign Out for staff
- OTP toggle preserved in Founder portal

#### Collapsible Sidebar
- Toggle between expanded (icon + label) and collapsed (icon only) on desktop
- Persists via localStorage across sessions
- Beta banner becomes Greek beta icon when collapsed
- All portals supported

#### Estate Switcher Relocation
- Removed estate switcher from sidebar entirely
- Beneficiary: estate selector at top-right of dashboard header (only when 2+ estates)
- Benefactor: EstateSelector already at top-right (hides for single estate)

#### Dev Portal Switcher Relocation
- Moved Portal Switcher into the CarryOn logo icon (sidebar, founder-only)
- Removed floating DEV button overlay from App.js
- Non-admin users cannot trigger the switcher (security enforced)
- Works on desktop (expanded/collapsed) and mobile

#### 10 New Staff Portal Features (All SOC2 Compliant) - FULLY IMPLEMENTED

**Founder Portal (4 features):**
1. **Platform Announcements** — Create/deactivate announcements targeted at specific audiences
2. **System Health Monitor** — Real-time database stats, active sessions, client errors, audit events
3. **Escalations (Founder View)** — View all operator escalations, resolve with notes
4. **Knowledge Base** — Create/edit/delete SOPs and procedures, categorized by department

**Operations Portal (5 features):**
1. **My Activity Log** — Personal audit trail grouped by date
2. **Quick Search** — Universal search across users, support tickets, DTS tasks, verifications
3. **Escalate to Founder** — Submit issues requiring founder attention with priority levels
4. **Shift Notes & Handoff** — Leave notes for the next operator, with acknowledge system
5. **Knowledge Base / SOPs** — Read-only access to founder-created procedures

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
- Founder: info@carryon.us / Demo1234!
- Benefactor: fulltest@test.com / Password.123
- Operator: Created via Founder Portal > Operators tab
