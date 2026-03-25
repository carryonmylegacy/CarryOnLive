# CarryOn - Estate Planning Application

## ZERO TOLERANCE: Perfect Code Every Push
**This is the #1 rule of this project. No exceptions. No excuses.**
Every push to GitHub must be production-perfect. No artifacts, no hanging chads, no "it's just a small thing." Fix everything proactively — dirty git diffs, stale files, unused imports, console.logs, TODO comments, version drift, lock file noise — before declaring anything ready to push. The agent must catch and resolve ALL of these without being told. This project did not get here by accepting little bullshit things along the way. The standard is perfection. Every. Single. Time.

**MANDATORY: Before EVERY push, run `bash /app/housekeeping.sh` — the 50-check CarryOn Housekeeping Protocol + SOC 2 Compliance Audit. ALL 50 checks must PASS. Do NOT tell the user "ready to push" without running this script first. No exceptions. Ever.**

## Original Problem Statement
A full-stack estate planning application allowing benefactors to manage digital estates, beneficiaries, documents, and messages. Features role-based access (admin, benefactor, beneficiary), invitation system, orbit visualization for family connections, and Stripe/IAP subscriptions.

## Core Architecture
- **Frontend**: React (CRA) + Shadcn/UI + TailwindCSS + Capacitor (iOS/Android)
- **Backend**: FastAPI + MongoDB (motor async)
- **Auth**: JWT-based with optional OTP, supports login via username or email
- **Storage**: AWS S3 for documents AND photos (presigned URLs)
- **Integrations**: xAI (Grok), Stripe, Apple IAP, AWS S3, Resend, Google Places, Capgo, CodeMagic, Railway, Vercel

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

## What's Been Implemented

### Completed (March 25, 2026 — Session 27: IAP Logic Consolidation + Backlog Cleanup)

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
