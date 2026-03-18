# CarryOn™ - Estate Planning Application

## Original Problem Statement
A full-stack estate planning application allowing benefactors to manage digital estates, beneficiaries, documents, and messages. Features role-based access (admin, benefactor, beneficiary), invitation system, orbit visualization for family connections, and Stripe/IAP subscriptions.

## Core Architecture
- **Frontend**: React (CRA) + Shadcn/UI + TailwindCSS + Capacitor (iOS/Android)
- **Backend**: FastAPI + MongoDB (motor async)
- **Auth**: JWT-based with optional OTP, supports login via username or email
- **Storage**: AWS S3 for documents AND photos (presigned URLs)
- **Integrations**: xAI (Grok), Stripe, Apple IAP, AWS S3, Resend, Google Places, Capgo, CodeMagic, Railway, Vercel

## Key Data Models
- **users**: email, password, username, username_lower, role, is_also_benefactor, is_also_beneficiary, photo_url (S3 key)
- **estates**: owner_id, beneficiaries[], name — **one user can own multiple estates**
- **beneficiaries**: estate_id, user_id, email, photo_url (S3 key), invitation_status, is_primary
- **family_plans**: fpo_user_id, members[], $1/mo benefactor discount, $3.49 flat beneficiary rate
- **digest_preferences**: user_id, frequency, content toggles, additional recipients

## What's Been Implemented

### Completed (March 16, 2026 — Session 6)
- **Infrastructure & Integration Audit**: Comprehensive review of all 17 integrations with verified subscription levels, current costs, and scaling requirements. Saved to `/app/memory/INFRASTRUCTURE_AUDIT.md`. Current spend ~$237/mo, projected ~$1,575-1,700/mo at 10K users.
- **Vercel Build Optimization**: Added `ignoreCommand` to `vercel.json`, set Root Directory to `frontend`, enabled skip deployments toggle. ~50% build minute savings.
- **MongoDB Upgrade**: User upgraded M10 → M30 ($394/mo) for production scaling.
- **Capgo Setup**: Created Maker account ($39/mo), uploaded first bundle (v0.1.0) to production channel. OTA live updates now functional.
- **xAI Credits**: $500 prepaid credits purchased for Estate Guardian AI.
- **xAI Credit Monitor (Founder Dashboard)**: `XAICreditsCard` on System Health tab. Tracks token usage per Guardian API call internally. Displays credits remaining, monthly spend, daily calls, 7-day chart, color-coded warnings. "Update Balance" button. Endpoints: `GET /api/admin/xai-credits`, `POST /api/admin/xai-credits/set-balance`. 100% test pass.
- **Integrations Vault Tab (Founder Dashboard)**: Password-protected "Integrations" tab listing all 17 integrations with verified plans, costs, masked credentials (show/hide toggle), dashboard quick links. 6 categories with sub-tab filtering. COGS Summary ($613.25/mo total, $600 verified). Unverified fields highlighted in amber for user to fill in. SOC 2 PDF export button generates full compliance report. **Capacity Dashboard**: 3 joined tiles showing Total Users (117) vs Max Capacity (5,000) vs Bottleneck (Resend). Colored borders: red=most limiting (Resend), orange=2nd (Capgo), yellow=3rd (MongoDB). Green dots on all others. Health warnings bar and database stats. Sole Operator Recommendations panel. 100% test pass (backend 24/24).

### Completed (March 16, 2026 — Session 5)
- **Billing Lifecycle: Grace Period & Dormant Flow**: Full implementation of payment failure handling. When Stripe reports a failed charge (via `invoice.payment_failed` webhook), the account enters a 30-day grace period with daily email reminders. After 30 days, the account goes dormant. Key files: `backend/services/billing_lifecycle.py` (core lifecycle), `backend/services/email.py` (email wrapper), `backend/guards.py` (dormant/grace access control), `backend/routes/subscriptions/checkout.py` (expanded Stripe webhook + status fields), `backend/server.py` (scheduler registration).
  - **Grace Period (past_due)**: Full access retained. Daily email reminders with countdown. Admin notified.
  - **Dormant**: Read-only access. No uploads, edits, DTS, beneficiary transitions. POA/Living Will remain accessible to beneficiaries.
  - **Reactivation**: On successful payment (`invoice.payment_succeeded` webhook), account instantly restored to active with confirmation email.
  - **Admin Notifications**: Admins notified on payment failure, dormant transition, and reactivation.
- **Admin UI: Billing Status Indicators**: Yellow border + badge for trial/grace period accounts, red border + badge for dormant accounts. Applied across UsersTab, SubscriptionsTab, and EstateHealthTab.
- **User-Facing Banners**: `BillingStatusBanner` component on dashboard shows grace period countdown or dormant state with CTA to update payment.
- **Trial Reminder Email Cadence**: Expanded from 2 reminders (10d, 5d) to 4 reminders (10d, 5d, 3d, 1d before expiration). Added a new "Trial Expired" email sent on the day the trial ends, explaining what's now restricted vs. still accessible, with a CTA to subscribe. Trial expiration and grace/dormant remain separate flows (trial = never paid, grace = payment failed on active subscriber).

### Completed (March 15, 2026 — Session 4)
- **Responsive UI Fix: OrbitVisualization**: Compressed orbit sizes on small screens (<380px): ball size 36px (was 42), center node 50px (was 60), reduced edge padding and base orbit radius for compact layout. Prevents horizontal overflow on iPhone 13 mini (375px).
- **Responsive UI Fix: Admin UsersTab**: Made UserRow flex-wrap with smaller avatars (w-8 sm:w-9), compact action buttons (h-7 w-7), and responsive text sizes. Status key bar uses flex-wrap. Role badges and secondary info hidden on small screens. No horizontal overflow.
- **Responsive UI Fix: Beneficiary Tiles**: Tile header switches from horizontal to vertical layout on mobile (flex-col sm:flex-row). Avatar reduced to 48px. Action buttons use compact sizing (h-7 w-7 p-0). Badge container flex-wraps to prevent overlap. All verified at 375px and 1920px viewports.

### Completed (March 15, 2026 — Session 3)
- **PieProgress Asymptotic Animation**: Reworked the PieProgress component on all 3 EGA export buttons (Transcript, Plan of Action, IAC Checklist) from a CSS `ease-out` animation to a JS-driven asymptotic progress curve (`1 - e^(-2t/d)`). Progress advances steadily but decelerates, capping at ~92% — never appearing "stuck" or finishing before the real operation completes.
- **IAC Two-Section Structure**: Updated the `generate_iac` AI prompt to explicitly require two distinct sections: (1) "Immediate Action Checklist for Beneficiaries" — post-death instructions for loved ones, and (2) "Estate Strengthening Recommendations for the Benefactor" — to-do items for the benefactor to fix now. Added a `section` field (`beneficiary_action` | `benefactor_recommendation`) to stored checklist items. Updated the IAC PDF export to render these as visually separated sections with distinct headers and descriptions.
- **IAC Report PDF Download**: The Generate IAC action now does both: injects recommendations into the existing IAC (with accept/reject/edit workflow), AND shows a "Download IAC Report PDF" button on the message. New endpoint `POST /api/guardian/export-iac-report` generates a two-section PDF with section-aware styling (green header for beneficiary actions, blue for benefactor recommendations).
- **Platform Polishing Pass (March 15, 2026)**: Comprehensive code quality and efficiency sweep:
  - Fixed blocking `subprocess.run` in `security.py` — wrapped ffmpeg calls in `asyncio.to_thread()` to avoid blocking the event loop
  - Added 17 missing MongoDB indexes for frequently-queried collections (`user_subscriptions`, `dts_tasks`, `death_certificates`, `tier_verifications`, `family_plans`, `emergency_access`, `section_security`, `digital_wallet`, `activity_log`, `notifications`)
  - Removed unused frontend dependencies (`react-window`, `zod`)
  - Consolidated redundant inline imports (`asyncio`, `subprocess`) to module-level
  - Full housekeeping: 38/38 checks pass (ruff, eslint, build, security scans, SOC 2 compliance)
  - Full platform test: 100% backend (11/11), 100% frontend (all pages verified)
- **Critical Bug Fix: Admin Role Authorization (March 15, 2026)**:
  - `require_benefactor_role()` in `guards.py` now includes `"admin"` — was blocking admin users from checklist accept/reject/delete and digital wallet access
  - Fixed ownership checks in `digital_wallet.py`, `documents.py`, `guardian.py`, `pdf_export.py`, `messages.py` to include admin fallback
  - Added `_get_user_estate()` helper in `guardian.py` for admin-aware estate queries
- **Ring Hierarchy Fix + Gender-Aware Relationship Inversion (March 15, 2026)**:
  - Fixed orbit ring assignments: Great-Grandmother/Great-Grandfather and Friend/Other moved from Ring 1 → Ring 3 (outermost)
  - Ring logic: Ring 0 (spouse, parents), Ring 1 (children, siblings, grandparents), Ring 2 (grandchildren, nieces/nephews, aunts/uncles, in-laws), Ring 3 (great-grand*, friend, other)
  - Implemented gender-aware relationship inversion: uses benefactor's declared gender to resolve "Son/Daughter" → "Son" (male) or "Daughter" (female), with slash fallback for unknown/non-binary

### Completed (March 14, 2026 — Session 2)
- **Guardian AI Cold-Start Fix (3-Layer Defense)**: Resolved recurring "temporary issue connecting to the AI service" error that struck after idle periods. Root cause: httpx connection pool lost keep-alive TCP connections to api.x.ai after inactivity. Fix: (1) Backend periodic keepalive — background task pings xAI every 5 minutes to keep connections warm (replaces one-time startup warmup). (2) Backend improved retry — 3 attempts with escalating backoff (0s, 1.5s, 3s) instead of 2 with 1s. (3) Frontend auto-retry — silently retries the API call once (with 2s delay) before showing an error to the user.
- **EGA State-Specific Law Calibration**: EGA now always reads the benefactor's current address from the `users` collection (Settings page) — not a stale estate-level cache. When a user changes their address in Settings, all owned estates' `state` field is proactively synced. The `gather_estate_context` function also syncs the estate state on every EGA query if it drifts. The system prompt emphasizes the declared state is sourced from Settings and all analysis must be tailored accordingly.
- **Beneficiary Succession Hierarchy**: Benefactors can now set a ranked succession order (Primary → Secondary → Tertiary → etc.) via drag-and-drop on the Beneficiaries page. Key changes:
  - Backend: `succession_order` field added to Beneficiary model. Reorder endpoint now sets `succession_order` + `is_primary` based on position. New `GET /api/beneficiaries/{estate_id}/succession` endpoint.
  - Backend: `PUT /api/beneficiaries/{id}/toggle-succession` endpoint to opt beneficiaries in/out of the succession chain. Opted-out beneficiaries have `succession_order: null` and are excluded from automatic promotion.
  - Backend: `promote_succession()` function in transition.py handles automatic promotion when a beneficiary dies (verified via TVT). Removes deceased from chain, re-indexes remaining, notifies promoted primary via in-app notification + email.
  - Frontend: Cards display succession badges (PRIMARY, SECONDARY, TERTIARY, etc.) with color-coded styling. Each card has a "Succession Chain" toggle switch to opt in/out. Opted-out cards show "NOT IN SUCCESSION" badge. "Succession Hierarchy" explainer box explains drag-to-reorder.
  - Notifications: Succession promotion triggers in-app notification (with badge), email notification, and login toast (via AmberAlertProvider).
  - Onboarding: Step renamed from "Designate Your Primary Beneficiary" to "Set Your Succession Order".
- **Beneficiary Portal — Relationship Label Inversion Fix**: The `family-connections` endpoint now inverts the relationship label for display on the beneficiary's portal. Previously, if a benefactor labeled a beneficiary as "Father" (what the beneficiary IS to them), the beneficiary's portal showed the same label next to the benefactor's name. Now it correctly shows the inverse — e.g., "Son/Daughter" (what the benefactor IS to the beneficiary). Full RELATION_INVERSE mapping covers all 25 relationship types.

### Completed (March 14, 2026 — Session 1)
- **Founder Portal — Operator Personal Info**: Operators tab expanded card now displays personal information (DOB, gender, marital status, address) when operators have filled in their profile via Settings.
- **Beneficiary Settings — Primary Beneficiary For List**: Replaced confusing "Primary Benefactor: [None]" with a clean vertical list of all benefactors for whom the user is designated as primary beneficiary. New endpoint: `GET /api/beneficiary/my-primary-for`.
- **Orbit Visualization Overhaul**: Complete rewrite of OrbitVisualization component — responsive sizing via ResizeObserver (scales from 358px mobile to 560px desktop), larger nodes (42-50px), correct ring hierarchy (Ring 0: Spouse+Children, Ring 1: Parents/Grandchildren/Siblings, Ring 2: Grandparents/Nieces/Nephews, Ring 3: Great-Grandparents), 37-degree stagger per ring. Adaptive node sizing shrinks nodes when a ring is crowded (floor 28px). Adaptive height — container only as tall as needed for active rings. Relationship mapping properly inverts the benefactor's perspective.
- **Guardian AI: To-Do List vs IAC Split**: Replaced single "Generate Checklist" button with two distinct functions: "Generate To-Do List" (estate-strengthening tasks for the benefactor, PDF download only, does NOT populate IAC) and "Generate IAC" (extracts specific contacts, phone numbers, policy numbers from vault documents for beneficiaries to use after benefactor's death, DOES populate the Immediate Action Checklist). New endpoint: `POST /api/guardian/export-todo`.
- **Codebase Cleanup**: Removed dead files: Dockerfile.bak, root-level backend_test.py, test_result.md, tests/archive/ directory. Removed unused getOrbitLevel/orbitColors from BeneficiaryHubPage.js (now imported from OrbitVisualization).

### Completed (March 13, 2026)
- **S3 Photo Migration**: All photos stored as S3 presigned URLs (not base64)
- **GZip Compression**: FastAPI GZipMiddleware for all responses
- **Multi-Estate Support**: Users can create multiple estates as benefactor (blended family scenario)
- **Sidebar Portal Switcher**: Single "My Benefactor Portal" pill (estate picker if 2+), single "My Beneficiary Portal" pill (goes to hub)
- **Light Mode Contrast Fix**: Darker accent colors (--bl3, --gn2, --pr2) for readable contrast
- **PhotoPicker Theme Fix**: Theme-aware button styles instead of hardcoded dark-mode colors
- **Portal Switcher Cache**: sessionStorage caching prevents config loss on page reload
- **FamilyTree Photo Fallback**: Estate nodes show owner_photo_url when estate_photo_url is missing
- **CI/CD Fix**: Pinned ruff version, Node.js 22, all CodeMagic env vars (Stripe, VAPID)
- **MongoDB Safety**: All projection warnings resolved with "id": 1
- **is_also_beneficiary Fix**: Flag correctly set when benefactor accepts invitation to another estate
- **Custom Estate Naming**: Editable estate name in Settings
- **AvatarCircle Component**: Camera icon overlay for photo uploads on empty avatars
- **Username Login**: Users can log in with either email or username
- **Custom Usernames**: All users can set a unique username in Settings (no verification needed)
- **Beneficiary Email Change → Re-invite**: When benefactor changes a beneficiary's email, invitation resets and prompts to resend
- **Login Field Updated**: Label and placeholder changed to "Username or Email"
- **FamilyTree Legend Fix**: Removed redundant "Blue nodes =" line, kept single "Blue = ..." line
- **App Freeze Fix**: Backend xAI call made non-blocking via asyncio.to_thread() in guardian.py
- **Admin Settings Access**: Settings page enabled for all admin roles with sidebar/mobile nav links
- **Admin Display Name Edit**: Admins can edit their own display name from Settings
- **Guardian Chat Session Persistence**: Fixed session ID mismatch bug and implemented persistent mount architecture
- **Role-Aware Email Digests**: Automated digest system for all user types with customizable frequency and content
- **Guardian AI First-Request Timeout Fix**: Connection warm-up, retries, parallelized context queries
- **Web App Auto-Update**: Version-check mechanism with hash-based hard refresh
- **Login Lockout Countdown**: Live countdown timer during rate-limit lockout
- **State-Aware AI & PDFs**: Legal disclaimer referencing user's state of residence
- **Universal Personal Information Editing**: All users can update name, address, contact info via Settings

## Critical Development Protocols

### Housekeeping Script (MANDATORY)
**Location:** `/app/housekeeping.sh`
**Rule:** Run `bash /app/housekeeping.sh` after EVERY change to ANY aspect of the platform — no exceptions. This is a production codebase used by real subscribers. The script validates: backend lint/format, frontend build, dependency security, SOC 2 compliance, env integrity, and more (38 checks total). ALL checks must pass before telling the user to push to GitHub.

### Auto-Update System (Web)
**Files:** `frontend/src/utils/versionCheck.js`, `frontend/package.json` (build script), `frontend/public/version.json`
Each `yarn build` generates a unique hash in `/version.json`. On app mount (5s delay, web only), the app fetches it cache-busted. If the hash differs from localStorage, it hard-refreshes once. Crash-safe via sessionStorage guard.

### Capacitor Live Updates (iOS — PLANNED)
See `/app/memory/CAPACITOR_LIVE_UPDATES.md`. Implement after App Store approval so iOS users get OTA web updates without new App Store submissions.

### Deployment Flow
User pushes to GitHub → Railway builds backend → Vercel builds frontend → Live at carryon.us. The Emergent preview site is NOT used for testing. All code must work on the real platform.

## Subscription Architecture
- Each estate requires its own active subscription
- Family Plan: $1/mo discount per bundled benefactor, $3.49 flat beneficiary rate
- Beneficiary pricing locked to benefactor's >50% subscription tier after transition
- Floor-exempt tiers: military, hospice, new_adult
- **Per-User Beta Program**: Admin can toggle beta for individual users. Beta users have no subscription fees. On deactivation, 30-day grace period starts. Beta users see a one-time welcome modal and a draggable floating bug report button on every page. Admin reviews tickets in the "Beta Testing" tab.

## Prioritized Backlog
### P0 - Active
- AWS S3 configuration for 10K users (user verification pending)

### P1 - Upcoming
- Share Extension Setup (instructions in /app/memory/SHARE_EXTENSION_SETUP.md)
- Capacitor Live Updates for iOS (plan in /app/memory/CAPACITOR_LIVE_UPDATES.md)
- Refactor LoginPage.js into smaller components

### P2 - Future
- Twilio SMS OTP Integration (blocked on A2P 10DLC approval)
- Scalability enhancements (CDN for S3, horizontal scaling)
- Settings page "flash" glitch investigation
- Video playback on Milestone Page investigation
- Resend upgrade Pro → Scale (before 5K users)
- Refactor integrations data from staff_tools.py to config/DB

### Completed (March 18, 2026 — Session 7)
- **Per-User Beta Feature Revamp**: Replaced global beta switch with per-user beta toggle. Admin can activate/deactivate beta for any user via the Users tab (Zap icon). On activation: no subscription fees + welcome modal on first login + draggable floating bug report button (yellow square with dark blue bug icon) on every page. On deactivation: 30-day grace period starts automatically. New "Beta Testing" admin tab lists all submitted tickets with auto-numbering and status management (Accept/Complete/Reject). Backend: 6 new endpoints in `/app/backend/routes/beta.py`. Frontend: 3 new components (BetaWelcomeModal, BetaFeedbackButton, BetaTestingTab). Testing: 15/15 backend tests passed, 100% frontend verified.
- **Auto-Send Beneficiary Invitation Emails**: Invitation emails are now automatically sent when a benefactor adds a new beneficiary (with email) during signup OR when saving a new beneficiary post-onboarding. Toast "Invitation email sent" shown on frontend. Manual invite/resend button still available. Shared helper: `/app/backend/services/invitation_sender.py`.
- **Beneficiary "Create Your Own Estate" Prompt**: Glass-pane popup appears when a beneficiary-only user logs in, inviting them to create their own benefactor account. "Create My Estate Plan" button navigates to `/create-estate`. "Skip for now" dismisses for the session. Prompt reappears every login until they create a benefactor account OR toggle off "Create Estate Reminder" in Settings.
- **Beneficiary Hard Delete**: Replaced soft-delete with clean hard-delete. Benefactors delete from their own estate only. Admins get a dialog: "This Estate Only" or "All Estates". Clean delete removes: beneficiary record, S3 photo, estate.beneficiaries array entry, primary_beneficiary_id, section_permissions, message recipients (pulled from arrays without deleting messages), digital wallet assignments, milestone deliveries, and beneficiary grace periods. Succession re-ordered after delete.

## Test Credentials
- Admin: info@carryon.us / Demo1234!
