# CarryOn - Estate Planning Application

## ZERO TOLERANCE: Perfect Code Every Push
**This is the #1 rule of this project. No exceptions. No excuses.**
Every push to GitHub must be production-perfect. No artifacts, no hanging chads, no "it's just a small thing." Fix everything proactively — dirty git diffs, stale files, unused imports, console.logs, TODO comments, version drift, lock file noise — before declaring anything ready to push. The agent must catch and resolve ALL of these without being told. This project did not get here by accepting little bullshit things along the way. The standard is perfection. Every. Single. Time.

**MANDATORY: Before EVERY push, run `bash /app/housekeeping.sh` — the 60-check CarryOn Housekeeping Protocol + SOC 2 Compliance Audit. ALL 60 checks must PASS. Do NOT tell the user "ready to push" without running this script first. No exceptions. Ever.**

## Original Problem Statement
A full-stack estate planning application allowing benefactors to manage digital estates, beneficiaries, documents, and messages. Features role-based access (admin, benefactor, beneficiary), invitation system, orbit visualization for family connections, and Stripe/IAP subscriptions.

## Core Architecture
- **Frontend**: React (CRA) + Shadcn/UI + TailwindCSS + Capacitor (iOS/Android)
- **Backend**: FastAPI + MongoDB (motor async)
- **Auth**: JWT-based with optional OTP, supports login via username or email
- **Storage**: AWS S3 for documents AND photos (presigned URLs)
- **Integrations**: xAI (Grok), Stripe, Apple IAP, AWS S3, Resend, Google Places, Capgo, CodeMagic, Railway, Vercel
- **Admin Routes**: Modular `routes/admin/` package (users, analytics, security_scan, estate_health, platform, grace_periods, dev_switcher)
- **Guards**: `guards.py` exports `require_admin`, `require_staff`, `require_benefactor_role`, `get_current_user` for DRY access control

## CRITICAL: User Deployment & Testing Workflow
**The user ALWAYS pushes to GitHub, deploys through Railway (backend) and Vercel (frontend), and tests EXCLUSIVELY on their production site (carryon.us) via iOS/PWA. NEVER suggest "check the preview URL" or "push to GitHub to see changes" — they already do this every time. All code changes MUST work in production deployment. Do not reference the preview environment when discussing what the user sees.**

## Key Data Models
- **users**: email, password, username, username_lower, role, is_also_benefactor, is_also_beneficiary, photo_url (S3 key), otp_enabled (default: true)
- **estates**: owner_id, beneficiaries[], name, name_customized
- **beneficiaries**: estate_id, user_id, email, photo_url (S3 key), invitation_status, is_primary
- **ega_tasks**: estate_id, type, status (running/completed/error), items_added, duplicates_skipped, duplicate_titles, started_at, completed_at
- **family_plans**: fpo_user_id, members[], $1/mo benefactor discount, $3.49 flat beneficiary rate
- **digest_preferences**: user_id, frequency, content toggles, additional recipients
- **platform_settings**: _id="global", otp_disabled (master switch)
- **subscription_settings**: _id="global", feature_gates (per-feature per-tier boolean map), feature_gates_published_at, feature_gates_published_by

## What's Been Implemented

### Completed (March 31, 2026 — Feature Gating System)

**Per-Tier Feature Gating for Subscription Management**
- Admin-controlled visibility gating per subscription tier (Founder Admin Portal → Subs tab)
- 9 platform features gateable: Beneficiaries, MM, IAC, SDV, EGA, FFN, DAV, DTS, Timeline
- Dashboard always visible (exempt from gating)
- Core features (MM, SDV, IAC) marked with CORE badge, default to ON
- All features start as explicitly toggled ON (not hard-coded)
- Save & Publish workflow — changes don't take effect until published with confirmation
- Global toggle per feature — turn a feature ON/OFF across ALL tiers at once
- Unpublished changes banner with Discard button
- Backend API enforcement via `GET /api/subscriptions/enabled-features`
- Data preservation — toggling off only hides, never deletes user data
- Beneficiary post-transition access governed by benefactor's tier
- Beta mode / trial / free access bypass — all features enabled
- Route-level protection — gated routes redirect to dashboard
- Navigation filtering in Sidebar.js, MobileNav.js (bottom nav + hamburger menu)
- Dashboard stat cards + preview sections conditionally hidden
- New files: `routes/feature_gates.py`, `FeatureGatesCard.js`, `featureGates.js`
- Test coverage: 9/9 backend, full frontend validation

### Completed (March 31, 2026 — Codebase Refactoring for Efficiency)

**Admin Route Module Split (1866 → 7 focused files)**
- Split monolithic `routes/admin.py` into clean `routes/admin/` package:
  - `users.py` (264 lines) — User CRUD, role management, session exemptions, activity log
  - `analytics.py` (351 lines) — Stats, revenue metrics, launch metrics, trial users
  - `security_scan.py` (357 lines) — SOC 2 security scan audit
  - `estate_health.py` (433 lines) — Estate health, diagnostics, ghost/orphan cleanup
  - `platform.py` (209 lines) — Platform settings, site content, code health, photo migration
  - `grace_periods.py` (111 lines) — Grace period management
  - `dev_switcher.py` (114 lines) — Dev switcher configuration
  - `__init__.py` (24 lines) — Combines all sub-routers

**DRY Access Control Guards**
- Added `require_admin` and `require_staff` dependency guards to `guards.py`
- Applied across 17 route files, eliminating ~51 inline role checks
- Guard files converted: `admin/`, `founder_invites.py`, `beta.py`, `dts.py`, `compliance.py`, `admin_digest.py`, `support.py`, `transition.py`

**.gitignore Cleanup**
- Reduced from 947 lines (290+ duplicate blocks) to 85 clean lines
- Added `test_reports/` exclusion

**Disk Cleanup**
- Purged `__pycache__/` directories (~1.4 MB)
- Cleared `node_modules/.cache/` (~1.5 GB)
- Removed 142 stale test reports (kept latest 5)

**Verification: All 60 housekeeping checks PASS, 148 Python files ruff clean, all 14 admin endpoints verified**

**Grace Period Admin Tab**
- Added "Grace Periods" tab to Admin/Ops portal with stats (Active, On Hold, Files Purged, Completed, All)
- "Sort by Hold" toggle to surface held estates at top
- Inline actions: Confirm (for auto-paused transitioned estates), Place/Remove Hold, Purge Files, Purge MMs
- MM Purge requires password confirmation (final, irreversible action)

### Completed (March 31, 2026 — Subscription Access Architecture + Grace Period System)

**Phase 1: Subscription Access Guards**
- Added guards to FFN (create/update), Guardian AI chat, Beneficiary creation
- Documents upload, Messages create, Checklist, Transition, Milestone reports already guarded
- Expired users can still VIEW/DOWNLOAD but cannot CREATE/UPLOAD

**Phase 2: 90-Day Grace Period System**
- `services/grace_period.py`: Core service managing the entire grace period lifecycle
- Triggers: subscription_expired, trial_ended, transition_hospice
- Auto-pause for transitioned estates until staff confirms
- Admin "hold" button to pause purge indefinitely
- Re-subscription cancels grace period and restores full access
- Countdown emails at 90, 60, 30, 15, 10, 5, 4, 3, 2, 1 days to ALL estate-associated emails
- Daily scheduler (10 AM EST) for countdown processing and auto-purge

**Phase 3: Data Purge with Audit Trail**
- Removes file content (S3) but preserves metadata in `purge_records` collection
- Milestone Messages are NEVER purged (only eligibility to report new milestones revoked)
- Full audit trail for every purged file
- Admin-only manual purge trigger endpoint

**Milestone Delivery Audit**
- Full audit logging for all milestone delivery actions (approve/schedule/reject)
- Staff notifications (P3 alerts) confirming delivery
- Scheduled delivery also audited when auto-executed by scheduler

### Completed (March 31, 2026 — Scheduled Milestone Delivery + Subscription Gate)
- **"Send on Date Requested" feature**: Staff can now choose "Send Now" (immediate delivery) or "Send on [Event Date]" (scheduled delivery) when reviewing milestone message matches. A background scheduler runs daily at 9 AM EST to process due deliveries automatically.
- **Subscription gate on milestone reports**: Beneficiaries must have an active subscription to submit new milestone reports. Previously delivered messages remain accessible forever regardless of subscription status.
- **New "Scheduled" status**: Added to delivery pipeline with blue visual indicator in admin stats.
- **Manual trigger endpoint**: `POST /api/milestones/process-scheduled` allows staff to manually trigger scheduled delivery processing.

### Completed (March 30, 2026 — Mobile/PWA UX Compliance Fixes)
- **Fixed all Section E housekeeping checks** (10/10 PASS):
  - Check 50: Fixed 7 sub-11px font instances (`text-[9px]`→`text-[11px]`, `text-[10px]`→`text-[11px]`) in AdminPage.js and FounderInvitesTab.js
  - Check 52: Added `safe-area-inset-top` to `toast.jsx`, `MobileNav.js`, `NetworkStatusBanner.js`
  - Check 54: Fixed 14 inputs/textareas across 12 files from `text-sm` to `text-base` (16px) to prevent iOS auto-zoom
  - Check 55: Added `overflow-y-auto` to 15 modal backdrop containers across the app for scroll safety on small screens

### Completed (March 30, 2026 — Sort Fix in Admin/Ops Users Tab)
- **Fixed sort dropdown** in UsersTab (shared by Founder Portal and Ops Portal): hierarchy (tree) view and graph (visual tree) view now respect the user's sort selection (First Name, Last Name, Date Created, Birthday, Most/Least Beneficiaries). Previously these views always hardcoded age-based sorting regardless of dropdown selection.
- **iOS zoom prevention**: Fixed sort `<select>` element font-size from 11px to 16px to prevent iOS auto-zoom on focus.

### Completed (March 29, 2026 — Session: Public About & Invite-Only Founder Pages)

#### Public "About for Everyone" Page
- **Improved backgrounds** on the existing AboutPage.js: warmer color palette (#0d1b2a), enhanced radial gradients with golden accents, better section layering
- Updated section backgrounds across hero, mission/vision, values, who we are, and CTA sections
- Updated nav bar border to match the warmer theme
- "About" header nav link continues to point to `/about`

#### Invite-Only "About the Founder" Page
- **New FounderAboutPage.js** component at `/founder-about/:token` route
- Renders the original `CarryOn_Founder.html` (11MB with 7 base64 embedded images) via iframe — all embedded styles/backgrounds preserved exactly as provided
- **Token verification flow**: verifying → valid (show iframe) → invalid (show Access Restricted with specific reason)
- Access denied states: not_found, revoked, no_token, error — each with tailored messaging
- "Visit About CarryOn" fallback button on denied pages

#### Founder Invite System (Backend)
- **Two separate collections**: `founder_invites` (token links) and `founder_access_requests` (request-based access)
- **Invite Links** — reusable, revocable tokens:
  - POST /api/founder/invites, GET /api/founder/invites, DELETE /api/founder/invites/:token
  - GET /api/founder-about/verify/:token — validates + tracks views
- **Access Requests** — request → admin approval with password → email+password login:
  - POST /api/founder/requests — public, submit request + email notification to admin
  - GET /api/founder/requests — admin lists all requests
  - POST /api/founder/requests/:id/approve — admin sets password
  - POST /api/founder/requests/:id/deny — admin denies
  - POST /api/founder/requests/:id/revoke — admin revokes approved access
  - POST /api/founder-about/login — public, email+password verification (reusable until revoked)

#### "Founder" Nav Button & Request Modal
- **"Founder" button** added to homepage header nav (right of "About")
- Opens a **frosted glass overlay** on the hero flag background
- Request form: name, email, optional message
- Duplicate pending request detection
- Success/already-pending/error states with branded UI
- "Already have access? Sign in here" link → /founder-about login form

#### Founder Page Login (/founder-about)
- Email + password login form (no OTP required)
- Frosted glass card over darkened flag background
- Password visibility toggle
- Error messages for wrong password, no access, etc.

#### Admin Panel Invites Tab (Updated)
- **Two sections**: Invite Links + Access Requests
- Access Requests show: pending (with approve/deny), approved (with revoke), denied, revoked
- Admin sets password manually when approving
- View count tracking for both invite links and approved requests

#### Admin Panel Invites Tab
- **New FounderInvitesTab** component added to Admin page at `/admin/founder-invites`
- Stats dashboard: Total / Active / Used invite counts
- Generate Invite Link form with optional note (e.g., recipient name)
- Invite list with status badges (Active/Used/Revoked), copy link, revoke actions
- Tab added to TAB_CONFIG with Gift icon


### Completed (March 25, 2026 — Session 29: Sidebar Portal Label Redesign + PWA Cleanup)

### Completed (March 26, 2026 — Session 30: Security Settings Consolidation + Email Preview Fixes)

#### Security Settings Consolidation (March 26, 2026)
- **Moved Account Security** (Passkey, 2FA, SMS OTP) from general Settings page to dedicated Security Settings page
- **Added Auto-Logout Timer** to Security Settings page with options: On App Leave (Instant), 1, 3, 5, 10, 15, 30 minutes, Daily (Midnight)
- **Daily (Midnight) auto-logout**: Calculates ms until local midnight and schedules a logout timer. Resets each session.
- **Removed auto-logout** from AppearanceCard (was previously under Appearance settings)
- **AuthContext updated** to handle `0` value for instant logout on app leave (triggers immediately on `visibilitychange` hidden)
- **Settings page** now shows a navigation card linking to Security Settings instead of inline security controls

#### Email Preview Modal Fixes (March 26, 2026)
- **Opaque background**: Changed modal overlay from transparent `bg-black/60` + `bg-[var(--card)]` to solid `bg-black/80` + `#0b1120`
- **Visible Close button**: Changed from ghost variant to outlined button with white text
- **Sticky header**: Preview modal header sticks to top when scrolling
- **Responsive Audit Digest**: Changed email HTML from fixed `width=600` to `max-width:600px`, reduced padding from 40px to 20px for mobile-friendly rendering

### Completed (March 26, 2026 — Session 29: SOC 2 Type 2 Hardening)

#### SOC 2 Compliance — 7-Item Implementation (March 26, 2026)
1. **Comprehensive Audit Logging**: Added `login_failed` audit events (warning severity) with IP address and reason. Added `stored_at` datetime field for TTL. All audit entries include SHA-256 integrity hashing.
2. **Session Management Hardening**: Password change now revokes ALL active sessions via `revoke_all_user_tokens()` and clears `active_session_id` / `last_login_at`. Single-session enforcement already existed.
3. **API Rate Limiting**: Already comprehensive — no changes per user request (120/min auth, 60/min moderate, 300/min general).
4. **Data Access Logging**: Added audit logging for beneficiary list views (`beneficiary_list_view` / `data_access` category), digital wallet access (`digital_wallet_view` / `data_access` category) with entry counts and access type.
5. **Admin Activity Trail**: Added CSV export endpoint (`GET /founder/audit-trail/export`) with configurable date range (30d/365d) and category/severity filters. Export button added to AuditTrailTab UI. Added `data_access` filter category.
6. **Automated Data Retention**: TTL index on `audit_trail.stored_at` (365 days auto-expiry). Daily `data_retention_scheduler` purges expired OTP trust, stale failed logins (7d), old OTP codes (1h), and blacklisted tokens (30d).
7. **Security Headers**: Already production-grade — HSTS (preload), CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, COOP, CORP, Permissions-Policy, Cache-Control on API routes. No changes needed.

#### SOC 2 Weekly Audit Digest + Founder Email Management (March 26, 2026)
- **Weekly SOC 2 Audit Digest email**: Auto-sent every Monday with analytics digest. Includes: total events, failed logins, critical/warning counts, data access patterns, password changes, top failed login IPs, most active users, daily activity sparkline chart.
- **Founder Email Management tab**: New `Emails` tab in Admin page with toggle controls for: Weekly Analytics Digest, SOC 2 Audit Digest, Security Alerts. Each has Send Now / Preview buttons. Audit digest supports additional recipients (e.g., external auditors).
- **Endpoints**: `GET/PUT /admin/email-preferences`, `POST /admin/audit-digest/send`, `GET /admin/audit-digest/preview`
- **Scheduler**: `send_audit_digest()` runs alongside `send_admin_analytics_digest()` in weekly scheduler, respects founder enable/disable preferences.

#### Sidebar Portal Label Redesign (March 25, 2026)
Restructured the sidebar logo/branding area in DashboardLayout:
- **Layout**: Portal label (e.g., "FOUNDER PORTAL", "BENEFICIARY PORTAL") now sits beneath both the logo icon AND "CarryOn™" text, spanning the full width
- **Sizing**: Logo enlarged to 54px, CarryOn™ to 28px, portal label to 16px bold white — all sized to stretch the full sidebar width
- **CarryOn™ alignment**: Text is now vertically centered on the logo icon via flexbox
- **Section titles**: "ESTATE PLAN ACCESS" added to benefactor nav (matching beneficiary), all section titles ("ESTATE PLAN ACCESS", "ACCOUNT", "TOOLS") increased to 14px bold for proper visibility across all portals
- **MobileNav**: Same section title updates applied — benefactor menus now show "ESTATE PLAN ACCESS", section titles enlarged to `text-sm font-bold`
- **Light mode**: Portal label uses dark navy (#0F172A), section titles use (#475569)

#### PWA iOS Swipe-Back — Abandoned (March 25, 2026)
After 4+ attempts across multiple sessions (touchmove blocking, pushState→replaceState monkey-patch, popstate interception with history trap), confirmed that iOS intercepts the swipe-back gesture at the system level before any web JavaScript can handle it. All swipe-back prevention code has been removed to keep the codebase clean. This is a known iOS WebKit limitation with no web-level workaround.

### Completed (March 25, 2026 — Session 28: Funnel Skip Sensitivity + Summary Refinement)

#### Fireworks Celebration on CTA Screen (March 25, 2026)
Added an American flag-themed fireworks display when the user reaches Step 4 (CTA) after completing their personalized plan:
- Uses `canvas-confetti` (1.9.4) with firework-style 360° bursts from randomized sky positions
- 8 staggered bursts over ~2 seconds, each with 80 particles (60 fast + 20 slow inner ring)
- Red/white/blue/gold color palettes matching the American flag motif and app aesthetic
- Fires only once per funnel session (ref-guarded)
- Reinforces the accomplishment of building a personalized plan and boosts trial conversion

#### Funnel "Skip" Visual Feedback & Summary Refinement (March 25, 2026)
Improved the funnel's feature card interaction to provide clear visual feedback and a respectful, personalized summary:

- **Skip Visual Feedback**: When tapping "Not for me", the current card now dims (60% opacity), scales down (0.97), and shifts to a warm-pink tint before transitioning to the next card after 450ms. Fixed a bug where the flash incorrectly showed on the *next* card instead of the one being skipped.
- **Summary Screen Rewrite**: After all feature decisions, the summary now shows:
  - **Top section**: Features the user kept, with a gold sparkles icon and confident message: "Your plan is built around these"
  - **Below separator**: Gently lists skipped features with warm copy: "And just in case you change your mind, these are included free during your trial — so you can experience them firsthand."
  - **Edge case**: If all features are skipped, shows: "All of our features are included free during your trial — explore everything and decide what fits."
- Tone validates user choices, reflects them back, and presents skipped features as a gift — not a correction or upsell.

### Completed (March 25, 2026 — Session 27: Acquisition Funnel + IAP Consolidation)

#### Social Media Acquisition Funnel (March 25, 2026)
Full campaign attribution and conversion tracking system for social media ad campaigns:

- **Frontend — `/get-started` funnel page** (`GetStartedPage.js`): 5-screen mobile-first onboarding flow
  - Screen 1: Interest selection (6 bubbles: protect family, organize docs, plan unexpected, guide beneficiaries, digital credentials, I'm a beneficiary)
  - Screen 2: Family qualification (family size, estate status, urgency)
  - Screen 3: Personalized feature cards with keep/skip interaction
  - Screen 4: CTA with social proof stats and "Start Free Trial" button
  - Screen 5: Referral — invite family member for +7 days trial bonus for both parties
- **Backend — Funnel API** (`/app/backend/routes/funnel.py`):
  - `POST /api/funnel/start` — Creates anonymous session, captures UTMs, IP geolocation via ip-api.com
  - `POST /api/funnel/step` — Records step completion with user selections
  - `POST /api/funnel/complete` — Marks funnel as completed, stores referral email
  - `POST /api/funnel/convert` — Links funnel session to user after signup, extends trial +7 days for referral
  - `GET /api/admin/funnel/analytics` — Aggregated analytics: drop-offs, by source, by campaign, by device, by state, by interest, referrals, recent sessions
- **Firebase Analytics** (`/app/frontend/src/services/firebase.js`): Initialized on funnel mount, fires events at each step for demographics, retention, and audience insights
- **Meta Pixel**: Placeholder ready — fires `ViewContent`, `Lead`, `CompleteRegistration` events. Will activate when Pixel ID is provided.
- **Admin Funnel Tab**: New tab in Founder portal with full analytics dashboard (drop-off waterfall, source/campaign comparison, device breakdown, geographic heatmap, interest clustering, referral stats, recent sessions table)
- **Login Page**: Added subtle "New to estate planning? See what CarryOn can do →" link on both mobile and desktop
- **Safeguards**: Logged-in users redirect to dashboard, returning non-converted visitors restart at CTA (Screen 4), 7-day reset for fresh funnel experience
- **Integrations Tab**: Added Firebase Analytics (active, free) and Meta Pixel (blocked, awaiting Pixel ID) tiles to admin Integrations tab under new "Analytics" category

#### IAP Logic Consolidation (March 25, 2026)
Extracted duplicated Apple In-App Purchase logic from `SubscriptionPaywall.js` and `SubscriptionManagement.js` into a single `useIAPPurchase` custom hook at `/app/frontend/src/hooks/useIAPPurchase.js`:
- **Hook API**: `useAppleIAP` (boolean), `restoringPurchases` (boolean), `purchaseWithIAP(planId, billing)`, `restoreWithIAP()`
- **SubscriptionPaywall.js**: Removed inline `useAppleIAP` state, `isIAPAvailable` useEffect, manual product ID resolution, and `handleRestorePurchases` implementation — all replaced with hook calls
- **SubscriptionManagement.js**: Removed `isIAPAvailable`/`purchaseIAP` imports and inline IAP logic in `handleSubscribe`, `handleChangePlan`, and `handleChangeBilling` — all three now use `purchaseWithIAP(planId, billing)` from the hook
- Zero behavior changes — pure DRY refactor. Product ID resolution uses the canonical `IAP_PRODUCTS` map in all paths now.
- **Updated housekeeping.sh** check #43 to recognize the hook import pattern alongside direct `services/iap` imports

#### Backlog Items Resolved (March 25, 2026)
- **Orbiting Estates UI Performance**: Confirmed fixed by user — crossed off backlog
- **Video Playback on Milestone Page**: Confirmed fixed by user — crossed off backlog (was recurring 5x)
- **Settings Page UI Glitch (FOUC)**: Crossed off backlog per user request

### Completed (March 25, 2026 — Session 26: Landing Page Background Lightening)

#### Landing Page Hero & Section Backgrounds (March 25, 2026)
Lightened the landing page to make the American flag hero image more visible and all scrolling sections slightly lighter:
- **Hero flag**: Increased opacity from `0.7` to `0.85` and reduced dark gradient overlay from `0.2/0.7` to `0.05/0.45`
- **Section backgrounds**: Changed base color from `#0B1221` to `#0E1829` across all sections (About, Features, Platform, Security, CTA)
- **Gradient sections**: Changed from `#0F1A2E/#0B1221` to `#111F34/#0E1829` (Reframe, Platform Features, Three Steps)
- **Texture overlays**: Slightly increased opacity on texture images so they show through more
- **Section gradient overlays**: Reduced opacity values by ~15-20% across all sections
- No content, layout, or functionality changes — purely cosmetic background lightening.

### Completed (March 24, 2026 — Session 25: Beneficiary Feature Enforcement + IAP Hardening)

#### SettingsPage.js Refactoring (March 25, 2026)
Extracted 1,626-line monolith into 7 self-contained component files + a 153-line layout shell:

- `ProfileCard.js` (269 lines) — Profile photo, display name, username, password
- `SecurityCard.js` (269 lines) — Passkey, 2FA toggle, SMS OTP setup/verify/disable
- `PersonalInfoCard.js` (230 lines) — Name, phone, DOB, gender, marital status, address
- `EstatePhotoCard.js` (146 lines) — Estate photo and name editing
- `AppearanceCard.js` (87 lines) — Theme, auto-logout, onboarding guide toggle
- `DigestCard.js` (272 lines) — Estate Health Digest preferences, frequency, sections, recipients
- `PrivacyCard.js` (295 lines) — GDPR consent, data export, retention policy, account deletion
- Each component manages its own state and data fetching. Zero visual or behavioral changes.
Benefactors toggle 7 feature flags per beneficiary (mm_access, ega_access, sdv_access, iac_access, ffn_access, dav_access, dts_access). Previously, beneficiary portal showed everything regardless. Now fully enforced:

- **Backend**: `GET /api/beneficiary/my-permissions/{estate_id}` now returns `feature_access` object with all 7 flags from the beneficiary record
- **TransitionGate.js**: Blocks navigation to denied sections (e.g., `/beneficiary/vault` if `sdv_access=false`) and redirects to `/beneficiary/dashboard`
- **BeneficiaryDashboardPage.js**: Stat cards and preview sections conditionally rendered based on `myPerms.feature_access`. Also optimized: permissions fetched once instead of twice.
- **Sidebar.js + MobileNav.js**: Navigation items filtered via `filterByFeatureAccess()` — hidden links for disabled features
- **localStorage**: `beneficiary_feature_access` stored by TransitionGate for nav components; cleaned up on context exit

#### Twilio SMS OTP Integration (March 24, 2026)
Full SMS-based two-factor authentication using Twilio. Users can set up SMS 2FA from Settings, and choose SMS vs Email on the login OTP screen.

- **Backend Endpoints**:
  - `GET /api/auth/sms-otp-status` — Returns current SMS OTP status and masked phone
  - `POST /api/auth/sms-otp-setup` — Sends verification SMS to provided phone (requires consent checkbox)
  - `POST /api/auth/sms-otp-verify` — Verifies phone OTP and enables SMS 2FA on user record
  - `DELETE /api/auth/sms-otp` — Disables SMS 2FA and removes phone number
- **Modified Endpoints**:
  - `POST /api/auth/login` — Now returns `otp_method`, `has_sms`, `masked_phone` when user has SMS enabled; sends OTP via SMS first, falls back to email
  - `POST /api/auth/resend-otp` — Accepts `method` parameter (`email` or `sms`)
- **Frontend — Settings Page**: SMS setup flow under Security card: phone input → consent checkbox → verification code → enabled. Only shows when 2FA is enabled.
- **Frontend — Login OTP Modal**: Shows SMS/Email toggle buttons when user has SMS enabled. Displays correct description based on delivery method. Resend button respects selected method.
- **IMPORTANT**: Twilio A2P 10DLC campaign resubmitted on March 24, 2026 with corrected CTA, opt-in flow, and differentiated message samples. Check back with Twilio in 2-3 weeks (mid-April 2026) for approval status. Once approved, SMS OTP delivery will go live.

#### IAP Fix Hardening (March 24, 2026)
- Added 10s timeout to `isIAPAvailable()` — previously no timeout, could hang forever
- Added 15s timeout to `getIAPProducts()` — prevent Store fetch hang
- Added 30s timeout to `restoreIAPPurchases()` — prevent restore hang
- Enhanced error diagnostics: when StoreKit can't find a product, logs available products and shows actionable guidance
- **Root cause of "Cannot find product" error identified**: User's Apple Developer account lacks a Paid Applications Agreement. Only a Free Apps Agreement exists. Without it, StoreKit returns no products. User is resolving with Apple.

## P0/P1/P2 Prioritized Backlog

### P0
- **SVG Family Tree Visual Overhaul**: COMPLETED (Session 17+18+19+20)

### Completed (March 25, 2026 — Session 29: SDV Drag-and-Drop Fix)

#### PWA Login Flow + Homepage Split (March 25, 2026)
Implemented PWA-optimized login architecture for App Store-less launch:
- **`/login` in PWA standalone mode**: Clean login-only view — CarryOn logo, "CarryOn™" text, login card (same form, OTP, forgot password), and "Visit Homepage" button that opens Safari via `window.open('/home', '_blank')`
- **`/login` on desktop/mobile browser**: Full marketing experience exactly as before — completely unchanged
- **`/home` (new page)**: Standalone marketing landing page with all content (About, Reframe, Features, Platform, Steps, Security, Hospice, CTA, Footer). Centered hero with "Get Started" and "Sign In" CTAs. Nav bar with "Sign In" link.
- **Option B (post-login)**: PWAInstallGuide modal fires 2s after first login from mobile browser. Step-by-step walkthrough auto-detects iOS Safari, iOS Chrome, or Android Chrome and shows platform-specific instructions. "Can't find it?" expandable for Safari top-bar users.
- **Option C (login banner)**: Persistent bottom banner on `/login` for mobile Safari/Chrome users (not PWA). "Get the CarryOn App — Install" with dismiss option. Uses localStorage to remember dismissal.
- **PWA detection**: `display-mode: standalone` media query + `navigator.standalone` fallback.
- All 50 housekeeping checks pass. Testing agent: 100% pass (8/8 tests).
Fixed drag-and-drop file rejection for PDFs in the Secure Document Vault:
- **Root cause**: File type validation only recognized `application/pdf` MIME type. Some browsers/OS combos report PDFs as `application/x-pdf`, `application/acrobat`, or `application/vnd.pdf`. Extension parsing via `split('.').pop()` also failed on filenames with trailing whitespace.
- **Fix**: Replaced inline validation with centralized `isFileAllowed()` function using regex-based extension extraction (`/\.([a-z0-9]+)\s*$/i`) and expanded MIME list. Applied to both global page drop handler and inner upload panel drop zone.
- **Auto-focus**: Added `uploadNameRef` + `pendingDropFocusRef` so the Document Name input auto-focuses 350ms after the upload panel opens from a drag-drop, matching user expectation of cursor-ready input.
- **Share target**: Updated `useShareTarget.js` ACCEPTED_TYPES with same expanded MIME list.
- **File input**: Updated `accept` attribute to include `.pdf` extension fallback and `application/x-pdf`.
- All 50 housekeeping checks pass.

### P1
- **Share Extension Setup**: Re-add the Share Extension target in Xcode per `/app/memory/SHARE_EXTENSION_SETUP.md`
- **iOS Live Updates**: Test Capgo OTA update flow end-to-end

### P2
- **Scalability Enhancements**: Horizontal scaling, background workers, CDN
- **Readiness Scoring Policy Page**: Informational page under Account section
- **Twilio SMS OTP**: A2P campaign resubmitted March 24, 2026. Check back mid-April 2026.

## Key API Endpoints
- `POST /api/security/verify/{section_id}` — validates PIN/Password/Question combos
- `GET /api/security/master-key-status` — checks if master key exists
- `GET /api/guardian/iac-task-status` — polls for EGA IAC generation status (running/completed/error)
- `POST /api/chat/guardian` — EGA AI chat with action support (generate_iac, analyze_vault, etc.)

## Critical Notes
- **User Testing Protocol**: User NEVER tests on preview URL. Deploys via GitHub → Railway/Vercel → tests on iOS device.
- **Voice Biometrics**: Completely removed. Do not reintroduce.
- **Eyeball Icons**: Any new password inputs MUST include `onMouseDown={(e) => e.preventDefault()}`.
- **Downloads**: All PDF downloads must use `/app/frontend/src/utils/downloadFile.js` for cross-platform compatibility.
- **SVG in JSX**: Platform's Babel plugin wraps dynamic JSX expressions (`{arr.map(...)}`, `{(() => { ... })()}`) inside SVG elements in a `<span>`, breaking SVG rendering. Use `dangerouslySetInnerHTML` for any dynamic SVG content.
- **FamilyTree.js**: DO NOT modify styling unless explicitly instructed. Extremely sensitive area.
- **Onboarding Flow (March 23, 2026)**: Simplified to 4 steps max. Address removed from signup — prompted at EGA with link to Settings. Beneficiary enrollment removed from signup — now first Getting Started step.
- **iOS Safe Area (March 23, 2026)**: Platform-wide fix — all Radix UI popper components (Select, DropdownMenu, Popover) use `collisionPadding` via `getSafeAreaTop()` to prevent dropdown content from rendering behind the iOS status bar/Dynamic Island. Dialog and Sheet components also respect safe area insets. Utility at `/app/frontend/src/lib/safeArea.js`.

## Signup Flow (Simplified March 2026)
- **Benefactor**: Name+Gender+DOB → Role → Special Eligibility → Credentials (4 steps)
- **Beneficiary**: Name+Gender+DOB → Role → Benefactor Email → Credentials (4 steps)
- **Minor (<18)**: Name+Gender+DOB+BenefactorEmail → Credentials (2 steps, auto-beneficiary)
- **Post-OTP**: Benefactors → /dashboard (with Getting Started overlay), Beneficiaries → /beneficiary

## Getting Started Flow (7 steps)
1. Add a Beneficiary (NEW)
2. Create a Milestone Message
3. Upload an Estate Document
4. Consult the Estate Guardian (requires address in Settings)
5. Customize Action Checklist
6. Set Succession Order **(optional)** — skip shows explanation, marks complete
7. Store a Digital Credential **(optional)** — skip shows explanation, marks complete
