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

### Session: Mar 2026 - Multi-Role Estate Creation Flow
- **Multi-Role Architecture**: Users can now be both benefactor and beneficiary under the same email. Primary role preserved, secondary access added via `is_also_benefactor` / `is_also_beneficiary` flags.
- **CreateEstatePage wizard** (`/app/frontend/src/pages/CreateEstatePage.js`): Multi-step wizard pre-populated from user profile. Step 1: Confirm personal info. Step 2: Choose role (Create My Own Estate as Benefactor OR Join Another Estate as Beneficiary). Step 3+: Family/beneficiary enrollment for benefactors.
- **New backend endpoints**: `POST /api/accounts/create-estate` creates estate without changing user role; `POST /api/accounts/add-beneficiary-link` links user as beneficiary to another estate by benefactor email. Auto-detection of existing accounts during beneficiary enrollment.
- **Updated `GET /api/estates`**: Now annotates each estate with `user_role_in_estate` (owner/beneficiary) for proper frontend role context.
- **Updated `GET /api/auth/me`**: Returns full profile (first_name, last_name, gender, DOB, address, marital_status) plus multi-role flags.
- **Sidebar & MobileNav role switching**: Context-aware navigation that adapts based on current path (benefactor routes show benefactor nav, beneficiary routes show beneficiary nav). "Switch View" section shows all accessible estates with role labels.
- **Disabled old `become-benefactor` endpoint**: Returns error directing users to the Create Estate wizard.
- **Refactoring**: Removed obsolete `EditBeneficiaryPage` import and route from App.js.
- **DashboardPage**: Filters to only show owned estates (not beneficiary estates).

### Session: Feb-Mar 2026 - SlidePanel UX Overhaul
- **Reusable SlidePanel component**: Replaces all Dialog modals for edit/create flows
- **Performance**: Client-side caching (`cachedGet.js`) for `/api/estates`, eager core page imports
- **Unified notifications**: Branded toast system via `AppNotification.js`
- **Voice recording fix**: iOS media permissions + MIME type fix
- **Railway deployment fix**: Pinned grpcio to stable version
- **PWA layout fix**: SlidePanel mobile positioning under header

### Previous Sessions
- Multi-portal architecture (Benefactor, Beneficiary, Admin, Operations)
- Stripe, xAI (Grok), AWS S3, Resend, Google Places, Capgo, CodeMagic integrations

## Architecture
- Backend: FastAPI + MongoDB (MONGO_URL from .env)
- Frontend: React + Capacitor (REACT_APP_BACKEND_URL from .env)
- Authentication: JWT-based with multi-role flags
- File storage: S3-compatible
- UI Pattern: SlidePanel for all edit/create flows
- Multi-role: `is_also_benefactor` and `is_also_beneficiary` flags on user docs; `user_role_in_estate` annotation on estate responses

## Blocked / Awaiting User Action
- P1: Twilio SMS OTP Integration (blocked on A2P 10DLC approval)
- P1: iOS Share Extension Setup (blocked on user Xcode/App Store Connect config)

## Backlog
- Delete obsolete `EditBeneficiaryPage.js` and `EditMilestonePage.js` files (routes already removed)
- Subscription paywall logic for beneficiaries who create estates (currently skipped for all beneficiaries)

## Key Components
- `/app/frontend/src/pages/CreateEstatePage.js` — Multi-role estate creation wizard
- `/app/frontend/src/components/SlidePanel.js` — Reusable slide-in panel
- `/app/frontend/src/components/layout/Sidebar.js` — Context-aware multi-role sidebar
- `/app/backend/routes/estates.py` — Estate management + multi-role endpoints

## Test Credentials
- Founder: info@carryon.us / Demo1234!
- Benefactor: fulltest@test.com / Password.123
