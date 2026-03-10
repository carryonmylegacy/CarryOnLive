# CarryOn Estate Planning Platform - PRD

## Original Problem Statement
Multi-portal estate planning platform (CarryOn) with FastAPI backend, React/Capacitor frontend, and MongoDB. Features include secure document vault, milestone messages, beneficiary management, digital access vault (DAV), guardian AI, and more.

## Core Requirements
- Benefactor portal for managing estate documents, beneficiaries, and messages
- Beneficiary portal for accessing shared estate information post-transition
- Admin/Operations portal for platform management
- SOC 2 compliance with AES-256 encryption
- iOS PWA and native app support via Capacitor
- **Multi-role support**: One user can be both benefactor (own estate) AND beneficiary (in another estate) simultaneously

## What's Been Implemented

### Session: Mar 10, 2026 - Family Tree HTML/CSS + Admin Graph View + Estate Health
- **Family Tree Component (P0 Fix)**: Rebuilt `FamilyTree.js` from broken SVG to robust HTML/CSS (divs + Flexbox). Shows benefactor at top (gold node), beneficiaries branching down (sorted by age), and estates where user is a beneficiary (blue nodes). Click-to-edit and click-to-navigate functionality. Responsive: tree-left + tiles-right on desktop, stacked on mobile.
- **Admin Graph View (P1 Feature)**: Replaced SVG-based graph view in `UsersTab.js` with HTML/CSS family trees per estate. View mode toggle cycles Tree -> Graph -> List. Each estate card shows benefactor node at top with beneficiaries branching below, sorted by age.
- **Estate Health Analytics (Enhancement)**: New `EstateHealthTab.js` in Admin with dedicated `GET /api/admin/estate-health` backend endpoint. Features: KPI cards (linking rate, completion rate, primary designation rate, invitation rate), health distribution bar (healthy/attention/critical), filter buttons, expandable estate cards with mini family trees showing health-status badges on each beneficiary node. Health score (0-100) calculated from: linking (30%), completion (30%), invitations (20%), primary designation (20%).
- **Family Tree Color Bug Fix**: Fixed tree nodes ignoring beneficiary's `avatar_color` and always showing gold for primary beneficiaries. Now uses actual color with "P" badge for primary indicator.
- **"Dependents" → "Beneficiaries" Rename**: Replaced all user-facing "Dependents" text with "Beneficiaries" across CreateEstatePage, SignupPage, and onboarding content. Labels now read "Beneficiaries Under 18" and "Beneficiaries Over 18".
- **CreateEstatePage UX**: Added "Apt / Unit / Suite" secondary address line field. Address and marital status auto-populated from user profile.
- **Create Estate Error Fix**: Wrapped beneficiary enrollment and checklist seeding in try/catch so estate creation always returns success even if post-creation steps fail partially.

### Session: Mar 10, 2026 - Bug Fixes, Drag-Reorder, Admin Redesign
- **Admin Delete Beneficiary Sync (P0 Bug)**: When admin deletes a user, the system now properly removes them from all estates' `beneficiaries` arrays and deletes their beneficiary records.
- **Onboarding Re-trigger Fix (P0 Bug)**: Fixed the "Getting Started" guided flow from re-triggering after a primary beneficiary is deleted and re-added. Once `celebration_shown` is True (user graduated onboarding), the system NEVER un-dismisses or re-shows guided flows/popups.
- **Drag-to-Reorder Beneficiary Tiles (P1 Feature)**: Added @dnd-kit integration for drag-and-drop sorting of beneficiary cards. Order persisted via `PUT /api/beneficiaries/reorder/{estate_id}`.
- **Admin Users Tab Redesign (P1 Feature)**: "All Estates" tab shows estate-centric tree view with benefactors and beneficiaries grouped by estate, sorted by age.

### Session: Mar 10, 2026 - Multi-Role Estate Creation Flow
- **Multi-Role Architecture**: Users can be both benefactor and beneficiary under same email.
- **CreateEstatePage wizard** (`/create-estate`): Multi-step wizard pre-populated from user profile.
- **New endpoints**: `POST /api/accounts/create-estate`, `POST /api/accounts/add-beneficiary-link`.
- **Sidebar & MobileNav role switching**: Context-aware navigation for multi-role users.

### Previous Sessions
- SlidePanel UX overhaul, performance caching, unified notifications, voice recording fix
- Multi-portal architecture (Benefactor, Beneficiary, Admin, Operations)
- Stripe, xAI (Grok), AWS S3, Resend, Google Places, Capgo, CodeMagic integrations

## Architecture
- Backend: FastAPI + MongoDB
- Frontend: React + Capacitor
- Authentication: JWT with multi-role flags
- File storage: S3-compatible
- UI Pattern: SlidePanel for edit/create, DnD Kit for drag-reorder
- Multi-role: `is_also_benefactor` and `is_also_beneficiary` flags on user docs

### Session: Mar 10, 2026 - P0 Bug Fix: Ghost Estates & Multi-Role Admin Visibility
- **Admin Multi-Role User Visibility (P0 Fix)**: Fixed `GET /api/admin/users` to attach `linked_beneficiaries` for users with `is_also_benefactor=True`, not just `role='benefactor'`. This allows admins to see and manage beneficiaries who also own estates.
- **Admin Estate Health Multi-Role Fix (P0 Fix)**: Updated `GET /api/admin/estate-health` to include estates owned by multi-role users. Added `is_also_benefactor` to the user projection query.
- **Frontend Benefactors Filter Fix (P0 Fix)**: Updated `UsersTab.js` to include `is_also_benefactor` users in the Benefactors tab filter, tree view, and graph view.
- **Ghost Estate Cleanup Workflow**: The existing `DELETE /api/admin/estates/{estate_id}` endpoint correctly deletes ghost estates and resets `is_also_benefactor` flag, allowing users to re-create their estate.

- **Ghost Estate Auto-Cleanup (Enhancement)**: Added automatic detection of ghost estates (orphaned, incomplete conversions, empty) in `GET /api/admin/estate-health`. New `POST /api/admin/cleanup-ghost-estates` endpoint for batch deletion with password confirmation. Frontend `GhostEstateAlert` component in Estate Health tab with expandable list, checkboxes, select all, and one-click "Clean Up" button.

## Blocked / Awaiting User Action
- P1: Twilio SMS OTP Integration (blocked on A2P 10DLC approval)
- P1: iOS Share Extension Setup (blocked on user Xcode/App Store Connect config)

## Backlog
- Subscription paywall logic for beneficiaries who create estates

## Key Components
- `/app/frontend/src/components/FamilyTree.js` -- HTML/CSS family tree visualization
- `/app/frontend/src/components/admin/EstateHealthTab.js` -- Estate health analytics with mini family trees
- `/app/frontend/src/pages/BeneficiariesPage.js` -- Drag-to-reorder beneficiary tiles + family tree layout
- `/app/frontend/src/components/admin/UsersTab.js` -- Estate-centric tree view + HTML/CSS graph view
- `/app/frontend/src/pages/CreateEstatePage.js` -- Multi-role estate creation wizard
- `/app/backend/routes/admin.py` -- Estate health endpoint + clean delete + stats
- `/app/backend/routes/beneficiaries.py` -- Sort order + reorder endpoint
- `/app/backend/routes/onboarding.py` -- Graduation-aware guided flow

## Test Credentials
- Founder: info@carryon.us / Demo1234!
- Benefactor: fulltest@test.com / Password.123
