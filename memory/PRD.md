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
- None currently active

### P1 - Upcoming
- Share Extension Setup (instructions in /app/memory/SHARE_EXTENSION_SETUP.md)
- Capacitor Live Updates for iOS (plan in /app/memory/CAPACITOR_LIVE_UPDATES.md)
- Refactor LoginPage.js into smaller components

### P2 - Future
- Video playback on Milestone Page investigation
- Settings page "flash" glitch investigation
- Twilio SMS OTP Integration (blocked on A2P 10DLC approval)
- Scalability enhancements (CDN for S3, horizontal scaling)
- Resend upgrade Pro → Scale (before 5K users)
- Refactor integrations data from staff_tools.py to config/DB

## Test Credentials
- Admin: info@carryon.us / Demo1234!
