# CarryOn Estate Planning Platform - PRD

## Original Problem Statement
Multi-portal estate planning platform (CarryOn) with FastAPI backend, React/Capacitor frontend, and MongoDB.

## Core Requirements
- Benefactor portal, Beneficiary portal, Admin/Operations portal
- SOC 2 compliance with AES-256 encryption
- iOS PWA and native app support via Capacitor
- **Multi-role support**: One user can be both benefactor AND beneficiary simultaneously

## What's Been Implemented

### Session: Mar 11, 2026 — Major UI/UX Unification & Text Cleanup
**Changes implemented:**
1. **Desktop Sidebar Redesign**: Matched PWA hamburger style — clean text links (no button boxes), nav-dividers between items, ACCOUNT items (Settings, Subscriptions, Security, Support) rendered smaller with `nav-item-sm` class. Bottom pinned stack: Notifications → Light/Dark → Collapse → separator → Switch View portal pills → separator → Sign Out. User info pill removed.
2. **MobileNav Hamburger Redesign**: Same bottom stack order (without Collapse). Notifications added via NotificationBell component. Portal pills styled as rounded pill buttons with separators.
3. **Ops Portal Users**: Delete buttons hidden in operatorMode — operators see full user tree/details but cannot delete.
4. **"legacy" → "estate plan"**: All user-facing text across frontend + backend updated (Dashboard, Login, Signup, Terms, Onboarding, Vault, Timeline, Guided Activation, Trial Reminders, etc.)
5. **"Future: Will/Trust Wizard & Eternal Echo"**: Removed from subscription plans (code + database sync).
6. **BENEFICIARY PORTAL label**: Shows under logo when on beneficiary routes.
7. **Estate Readiness Score**: Font increased to `text-base` on desktop for Docs/Messages/Checklist labels.
8. **Subscription text**: Changed to "Choose a payment option that best suits you. (Monthly/Quarterly/Annual)".
9. **Last-viewed estate default**: `carryon_last_portal` persisted in localStorage, restored on login for multi-role users.
10. **Switcher text**: Context-aware — "in the menu on the left" (desktop) vs "in the hamburger menu" (mobile).
11. **Testing**: 100% pass rate on both backend and frontend.

### Session: Mar 10, 2026 — Portal Navigation Refactor (Dropdown Removal)
**Issue**: The estate selector dropdown was a persistent source of UI bugs and user frustration.
**Fix**: Completely removed EstateSelector.js and ViewSwitcher.js dropdown components. Replaced with simple inline portal switching links:
1. **Sidebar.js**: "Switch View" section with direct portal links (expanded + collapsed icon buttons)
2. **MobileNav.js**: Inline portal switching buttons in hamburger menu, context-aware nav items (shows beneficiary items on /beneficiary routes)
3. **Deleted files**: EstateSelector.js, ViewSwitcher.js
4. **Testing**: 100% pass rate — multi-role switching, context-aware nav, admin exclusion all verified

### Session: Mar 10, 2026 — Portal-Aware Paywall Fix
**Bug**: When a beneficiary creates a benefactor account (multi-role), the benefactor portal showed beneficiary plans instead of benefactor plans. Additionally, the beneficiary sidebar "Subscription" link navigated to the benefactor subscription page.
**Root cause**: (1) `SubscriptionManagement.js` used `user.role === 'beneficiary'` to select plans. (2) Beneficiary sidebar linked to `/subscription` (benefactor page).
**Fix**:
1. **SubscriptionManagement.js**: Route-context-aware plan selection
2. **App.js**: Paywall gating + added `/beneficiary/subscription` route
3. **SubscriptionPage.js**: Portal-aware (different heading, hides benefactor-only elements)
4. **Sidebar.js + MobileNav.js**: Beneficiary nav links to `/beneficiary/subscription`
5. **checkout.py**: Beta mode subscription save works for multi-role users
6. **Housekeeping**: All 35 checks passed. CodeMagic build number: `$(date +%s)`
7. **Eligibility Step in CreateEstatePage**: Added 'Special Eligibility' as the LAST step in the beneficiary-to-benefactor onboarding wizard.

### Session: Mar 10, 2026 — ROOT CAUSE FIX: Login Redirect + Welcome Step
**Root cause identified and fixed**: `PublicRoute` in App.js was racing against `navigateToHome` — for beneficiary-role users with `is_also_benefactor=true`, React's re-render of `PublicRoute` would redirect to `/beneficiary` BEFORE `navigateToHome` could fire `navigate('/dashboard')`.

**Fixes applied:**
1. **PublicRoute (App.js)**: Added `is_also_benefactor` check BEFORE the generic beneficiary redirect
2. **navigateToHome (LoginPage.js)**: Added multi-role check for beneficiary users
3. **Passkey login redirect (LoginPage.js)**: Same fix applied
4. **Welcome Step in Guided Overlay (DashboardPage.js)**: Added "Welcome to Your Estate" intro step that appears BEFORE Step 1 of 6 for multi-role users only (role=beneficiary + is_also_benefactor=true)
5. **Diagnostic endpoints**: `/api/health` returns build hash, `/api/debug/user-state?email=X` returns computed multi-role state

**Production issue with pieva2021@gmail.com:**
- `beneficiary_count_in_first_estate: 0` — beneficiaries weren't saved during estate creation (likely created on older code)
- User needs to add beneficiaries via the Beneficiaries page in their dashboard
- Estate creation code verified working correctly with new test user

### Previous Sessions (most recent first)
- Ghost Estate Fix, SOC 2 Compliance, Auth Model Refactor
- Family Tree HTML/CSS, Admin Graph View, Estate Health Analytics
- Drag-to-Reorder, Admin Redesign, Multi-Role Estate Creation
- SlidePanel UX, caching, notifications, multi-portal architecture
- Stripe, xAI (Grok), AWS S3, Resend, Google Places, Capgo, CodeMagic integrations

## Architecture
- Backend: FastAPI + MongoDB
- Frontend: React + Capacitor
- Auth: JWT with multi-role flags (`is_also_benefactor`, `is_also_beneficiary`)
- Deployment: Railway (Backend) + Vercel (Frontend)

## Known Issues
- Production user pieva2021@gmail.com has 0 beneficiaries (data issue, not code bug — needs to re-create estate via /create-estate)

## Upcoming Tasks
- P1: Finalize Share Extension Setup (re-add Share Extension target in Xcode per /app/memory/SHARE_EXTENSION_SETUP.md)
- P1: Twilio SMS OTP Integration (blocked on A2P 10DLC approval)
- CORS wildcard review (housekeeping warning — verify middleware.py)

## Test Credentials
- Founder: info@carryon.us / Demo1234!
- Pure Benefactor: fulltest@test.com / Password.123
- Multi-role Beneficiary: testben@test.com / Password.123
- Production test: pieva2021@gmail.com
