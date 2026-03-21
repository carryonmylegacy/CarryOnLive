# CarryOn - Estate Planning Application

## Original Problem Statement
A full-stack estate planning application allowing benefactors to manage digital estates, beneficiaries, documents, and messages. Features role-based access (admin, benefactor, beneficiary), invitation system, orbit visualization for family connections, and Stripe/IAP subscriptions.

## Core Architecture
- **Frontend**: React (CRA) + Shadcn/UI + TailwindCSS + Capacitor (iOS/Android)
- **Backend**: FastAPI + MongoDB (motor async)
- **Auth**: JWT-based with optional OTP, supports login via username or email
- **Storage**: AWS S3 for documents AND photos (presigned URLs)
- **Integrations**: xAI (Grok), Stripe, Apple IAP, AWS S3, Resend, Google Places, Capgo, CodeMagic, Railway, Vercel

## Key Data Models
- **users**: email, password, username, username_lower, role, is_also_benefactor, is_also_beneficiary, photo_url (S3 key), otp_enabled (default: true)
- **estates**: owner_id, beneficiaries[], name, name_customized
- **beneficiaries**: estate_id, user_id, email, photo_url (S3 key), invitation_status, is_primary
- **family_plans**: fpo_user_id, members[], $1/mo benefactor discount, $3.49 flat beneficiary rate
- **digest_preferences**: user_id, frequency, content toggles, additional recipients
- **platform_settings**: _id="global", otp_disabled (master switch)

## What's Been Implemented

### Completed (March 21, 2026 — Session 13: CI Fix + iOS Modal Zoom Fix)
- **CI Backend Lint Fix**: Removed unused `result` variable in `staff_tools.py` PUT endpoint. Ran `ruff format` to fix formatting. Both `ruff check` and `ruff format --check` now pass cleanly.
- **CI Actions Upgrade**: Upgraded `actions/checkout` from v4 to v5 and `actions/setup-node` from v4 to v5 in `.github/workflows/ci.yml` to resolve Node.js 20 deprecation warnings (forced June 2, 2026).
- **IntegrationsTab X Import Fix**: Added missing `X` icon import from lucide-react used by password modal and edit modal close buttons.
- **iOS Safari Zoom Prevention**: All `<input>` elements in IntegrationsTab modals verified with `fontSize: '16px'` inline style to prevent iOS Safari auto-zoom on focus.

### Completed (March 21, 2026 — Session 12: Tree Connector Lines + Collapsible Beneficiary Tiles)
- **Admin Hierarchy View Lines Fix**: Horizontal connector lines in renderTreeView() now extend only from the vertical spine to the right (not beyond to the left). Fixed `alignSelf: 'flex-end'` approach.
- **Admin Tree View Lines Fix**: Replaced percentage-based `left-[10%] right-[10%]` horizontal bar with per-node segments using `left: isFirst ? '50%' : 0, right: isLast ? '50%' : 0`, ensuring the bar spans exactly from center of first child to center of last child.
- **Estate Health Tree Fix**: Same per-node connector segment pattern applied to mini family tree in expanded estate health cards.
- **Collapsible Beneficiary Tiles**: Beneficiary cards on BeneficiariesPage now collapsed by default showing only avatar, name, relation, succession badge, and a chevron caret. Click to expand full details (email, phone, DOB, permissions, invitation controls). Uses `expandedTiles` Set state.
- **BeneficiaryLeaf Cleanup**: Removed redundant `ml-8 pl-4 border-l-2` from BeneficiaryLeaf component since connector column handles tree lines.
- **Testing**: 100% pass rate (iteration 133) — all 6 features verified.
- **Family Tree Trunk Termination**: Vertical trunk line in FamilyTree.js spine layout no longer extends below the last beneficiary. Changed from continuous trunk (`bottom: 0`) to per-row segments with `bottom: isLast ? '50%' : 0`, creating a clean 90-degree turn at the last branch.
- **Removed Redundant Benefactor Tiles**: Removed the "Family Members List" section from BeneficiaryHubPage since the orbit balls and estate tiles already link to the same places. Page now flows: Orbit → Change Photos → Estate Tiles → Info/CTA.
- **Integrations Tab Unlocked + Editable**: Removed password lock from viewing integrations. Added GET `/admin/integrations` endpoint (no password) that returns all data with sensitive values stripped. Added PUT `/admin/integrations/{id}` endpoint (password required) to save overrides to MongoDB `integration_overrides` collection. Frontend now auto-loads on mount, prompts for password only when revealing credentials or editing. Each card has an Edit button that opens a modal with editable fields (details, cost, cost note).

### Completed (March 19, 2026 — Session 10: Family Tree Colors + Apple IAP Fix + Font Sweep)
- **Beneficiary Color Coding**: Green = linked (has own login), Yellow = unlinked (no account yet). Legend now explains all 3 colors including benefactor's gold.
- **Apple Guideline 3.1.1 Fix**: iOS native app now NEVER falls through to Stripe. All payment paths (subscribe, change plan, change billing) block Stripe on iOS.
- **Global Font Minimum Sweep**: Eliminated all text-[8px], text-[9px], text-[10px] across entire frontend (~330 instances). New minimum is text-[11px]. FamilyTree names bumped to text-xs (12px), sublabels to text-[11px].
- **Orbit Click Fix**: Increased click guard threshold from 1° to 5° in OrbitVisualization to fix tap-to-navigate on mobile.
- **CI Lint Fix**: Fixed ruff formatting and projection warnings. Housekeeping 38/38 PASS, zero warnings.
- **Zero-Tolerance Housekeeping Rule**: Documented in PRD that ALL housekeeping checks must PASS with zero warnings, every fork, every session.

### Completed (March 19, 2026 — Session 9: Settings & Admin Overhaul)
- **Settings Page Reorganization**: Moved Security card to right after Profile card. New order: Profile > Security > Personal Information > Estate Photo > Push Notifications > Appearance > Notifications & Digest > Privacy & Data Rights > Logout.
- **Per-User 2FA Toggle**: Each user now has an `otp_enabled` field (default: true). New endpoints: `GET /api/auth/2fa-preference` (returns user's preference + global status), `PUT /api/auth/2fa-preference` (toggle own 2FA). Login flow checks global switch first, then per-user preference. Global master switch behavior: when admin turns global ON (otp_disabled: false), ALL users' otp_enabled resets to true. Users can then individually disable. When global is OFF, all 2FA is disabled regardless of individual preference. Settings page shows "Disabled platform-wide by administrator" with grayed-out toggle when global is off.
- **Sort By in Admin UsersTab**: Added dropdown with 7 options: Default, First Name, Last Name, Date Created, Birthday, Most Beneficiaries, Least Beneficiaries. Compact, responsive design that doesn't break PWA layout. Applied to all view modes (List, Tree, Graph).
- **Testing**: 100% pass rate — 10/10 backend tests, all frontend UI elements verified (iteration 132).

### Completed (March 18, 2026 — Session 8: Codebase Polish & Refactoring)
- **DRY: API_URL Extraction**: Extracted API_URL from 88 files into `frontend/src/config.js`.
- **DRY: getAuthHeaders Consolidation**: Removed 3 redundant definitions.
- **.gitignore Cleanup**: 595 → 71 lines.
- **Dead CSS/Code Removal**: ~119 lines CSS, 4 unused files, 24 stale test files (~9K lines).
- **Bug Fix: Beneficiary Login Lockout**: Pending invitations no longer trigger failed login counts.
- **UX Fix: Settings Save Feedback**: Save/Cancel buttons with spinners and toasts.
- **Feature: Estate Name Personalization Prompt**: One-time modal for renaming default estates.
- **Security Fix: Admin Estate Permissions**: Only estate owners can rename.

### Completed (March 18, 2026 — Session 7)
- Per-User Beta Feature, Auto-Send Beneficiary Invitations, Beneficiary "Create Your Own Estate" Prompt, Beneficiary Hard Delete.

### Completed (March 16, 2026 — Session 6)
- Infrastructure & Integration Audit, Vercel Build Optimization, MongoDB Upgrade, Capgo Setup, xAI Credits, xAI Credit Monitor, Integrations Vault Tab.

### Completed (March 16, 2026 — Session 5)
- Billing Lifecycle (Grace Period & Dormant), Admin Billing Indicators, User-Facing Banners, Trial Reminder Email Cadence.

### Completed (March 15, 2026 — Session 4)
- Responsive UI Fixes (OrbitVisualization, Admin UsersTab, Beneficiary Tiles).

### Completed (March 15, 2026 — Session 3)
- PieProgress Animation, IAC Two-Section Structure, IAC Report PDF, Platform Polishing, Admin Role Auth Fix, Ring Hierarchy Fix.

### Completed (March 14, 2026 — Session 2)
- Guardian AI Cold-Start Fix, EGA State-Specific Law, Beneficiary Succession Hierarchy, Relationship Label Inversion.

### Completed (March 14, 2026 — Session 1)
- Founder Portal Operator Info, Beneficiary Primary-For List, Orbit Visualization Overhaul, Guardian AI To-Do/IAC Split.

### Completed (March 13, 2026)
- S3 Photo Migration, GZip, Multi-Estate, Sidebar Switcher, Light Mode, CI/CD, Username Login, and more.

## Critical Development Protocols

### Housekeeping Script (MANDATORY)
**Location:** `/app/housekeeping.sh`
Run after EVERY change. Validates: backend lint/format, frontend build, dependency security, SOC 2 compliance, env integrity (38 checks).
**ZERO TOLERANCE RULE:** Every single check must be PASS. No warnings are acceptable — not "non-blocking", not "pre-existing", not "minor". If housekeeping surfaces ANY warning or failure, fix it immediately before finishing the task. This applies to every fork, every session, every time.

### Auto-Update System (Web)
Each `yarn build` generates a unique hash in `/version.json`. App checks on mount and hard-refreshes if different.

### Deployment Flow
User pushes to GitHub → Railway builds backend → Vercel builds frontend → Live at carryon.us.

## Subscription Architecture
- Each estate requires its own active subscription
- Family Plan: $1/mo discount per bundled benefactor, $3.49 flat beneficiary rate
- Per-User Beta Program with admin toggle

## Prioritized Backlog

### P0 - Active
- iOS Safari Zoom Trap on Integration Edit Modal — Fix applied (text-base/16px on all inputs, X close button added), verified via lint + screenshot

### P1 - Upcoming
- Share Extension Setup (instructions in /app/memory/SHARE_EXTENSION_SETUP.md)
- Capacitor Live Updates for iOS (plan in /app/memory/CAPACITOR_LIVE_UPDATES.md)
- Refactor LoginPage.js into smaller components

### P2 - Future
- **(NEW) FFN — Family & Friends Notification:** A standalone main feature page (like Milestone Messages, DTS, SDV) where the benefactor creates a list of people they want their beneficiaries to contact and notify of their passing. NOT a DTS task — this is an open, non-confidential list with names + contact info (phone, email, address) that the family can reference. Think of it like the Login & Password Vault but for "people to notify." The benefactor is asking their beneficiaries to handle these notifications, not CarryOn/DTS. This is distinct from the DTS "Transition Notification" type (which is confidential, handled by DTS, and hidden from family).
- **(NEW) Estate Readiness Scoring Policy Page:** Add a "Policies" or "How We Score" page under the Account section of the menu. Displays the Estate Readiness Score rubric so benefactors understand how their score is calculated: Documents (Will + Trust + POA = 80%, +extras = 100%), Messages (age-based milestone expectations per beneficiary), Checklist (15 items created = 100%). This is informational, not editable.
- Video playback on Milestone Page investigation
- Settings page "flash" glitch investigation
- Twilio SMS OTP Integration (blocked on A2P 10DLC approval)
- Scalability enhancements (CDN for S3, horizontal scaling)
- Resend upgrade Pro → Scale (before 5K users)
- Refactor integrations data from staff_tools.py to config/DB

## Test Credentials
- Admin: info@carryon.us / Demo1234!
