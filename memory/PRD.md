# CarryOn Estate Planning Platform - PRD

## Original Problem Statement
Multi-portal estate planning platform (CarryOn) with FastAPI backend, React/Capacitor frontend, and MongoDB.

## Core Requirements
- Benefactor portal, Beneficiary portal, Admin/Operations portal
- SOC 2 compliance with AES-256 encryption
- iOS PWA and native app support via Capacitor
- **Multi-role support**: One user can be both benefactor AND beneficiary simultaneously

## What's Been Implemented

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
- Production user pieva2021@gmail.com has 0 beneficiaries (data issue, not code bug)

## Upcoming Tasks
- P1: Finalize Share Extension Setup
- P1: Twilio SMS OTP Integration (blocked on A2P 10DLC approval)

## Test Credentials
- Founder: info@carryon.us / Demo1234!
- Pure Benefactor: fulltest@test.com / Password.123
- Multi-role Beneficiary: testben@test.com / Password.123
- Production test: pieva2021@gmail.com
