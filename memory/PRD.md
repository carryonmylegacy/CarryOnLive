# CarryOn™ — Product Requirements Document

## Original Problem Statement
CarryOn is a secure, AI-powered estate planning platform for American families. It helps users organize critical end-of-life documents, milestone messages, and digital asset credentials, encrypted and stored securely for beneficiaries to access when the time comes.

## Core Architecture
- **Frontend**: React 19 (CRA via Craco) + Tailwind CSS + Shadcn/UI — 32 pages, 74 components, 65 packages
- **Backend**: FastAPI (Python 3.11) — 170 endpoints, 26 route modules, 7 services, modular architecture
- **Database**: MongoDB Atlas (production) / local MongoDB (preview) — 35 collections
- **Storage**: AWS S3 (carryon-vault, us-east-2)
- **AI**: xAI Grok-4 (Estate Guardian AI)
- **Payments**: Stripe (checkout, subscriptions, proration)
- **Email**: Resend (OTP, notifications, digests)
- **Hosting**: Vercel (frontend) + Railway (backend)
- **Mobile**: Capacitor 6 → Codemagic → TestFlight
- **CI/CD**: GitHub Actions (lint + build)

## Subscription & Access Model
- **Free download** from App Store
- **30-day free trial** on signup — full access to all features
- **After trial expires (no subscription)**:
  - **Benefactor**: Read-only. Can view existing documents, messages, checklist. CANNOT upload new documents, create new messages, or add checklist items.
  - **Beneficiary**: Can view Living Will/Healthcare Directive and Power of Attorney regardless of subscription. CANNOT upload death certificate to trigger transition until benefactor's estate has active subscription.
- **Active subscription**: Full access restored
- **B2B/Enterprise codes**: Override subscription requirement (free_access flag)
- **Enforcement**: `guards.py` — `require_active_subscription` dependency checks trial, subscription, beta mode, and overrides. Applied to POST endpoints for documents, messages, checklist, and death certificate upload.

## Completed Features (All Sessions)

### Session Feb 28 – Mar 2, 2026
- In-app PDF viewer (react-pdf floating tile with zoom/navigation)
- Document card thumbnails (lazy-loaded PDF first-page + image previews)
- Subscription UI redesign (role-aware, billing toggle, Stripe checkout)
- Beneficiary locked tier logic (based on benefactor's majority plan)
- Military/Hospice verification flow (upload → admin approve → notify via support)
- Subscription proration (downgrades → customer service, upgrades → Stripe)
- Beneficiary payment lifecycle (DOB auto-detection, 30-day grace periods)
- Death certificate → seal & release flow (grace periods auto-created)
- Mobile refinements (opaque header, safe-area, onboarding position)
- 2026 premium design palette (teal-navy + warm gold, liquid-glass cards)
- Readiness gauge labels (Getting Started / Building / Strong / Protected)
- Getting Started wizard (individual tiles, auto-pop on complete, auto-restore on 0)
- 3-2-1 countdown for video/voice recording
- Customer Service chat for beneficiaries
- Face ID (native Capacitor app via iOS Keychain) + iOS autofill for PWA
- PWA manifest (standalone mode, no Safari toolbar)
- Admin dashboard actionable metrics (Needs Attention + Platform Overview)
- SOC 2 audit (15 controls, all passing)
- Deep lint (Python ruff + JS ESLint, all clean)
- Monolith organization (server.py → middleware.py + schedulers.py)
- Security hardening (rate limiting, CSP, file upload validation, error handling)
- HIPAA fully removed, SOC 2 + GDPR only
- .gitignore cleanup (multiple times)
- Domain migration (carryon.us → Vercel)
- CI/CD fixes (GitHub Actions, Codemagic Xcode 26.3)

### Session Mar 5, 2026
- Admin Tree View: benefactor-beneficiary tree with linked_beneficiaries
- New Adult (18-25) Signup Flow with parent/guardian framing
- Debug overlay removed from mobile header
- Native app download fix (Filesystem + Share plugins)
- CI/CD Build Fixes (import aliases, ESLint, ruff format)
- Signup UX Fixes (clarifier text, scrollable form, middle name, red asterisks)
- Primary Beneficiary Designation Feature (backend + frontend + guided flow)
- Post-Transition Beneficiary Access Requests
- Paired Pricing (Post-Transition)
- Google Places Autocomplete on all address fields
- Enhanced Signup Wizard (6 steps)
- Auto-estate creation on benefactor registration
- Auto-beneficiary stubs
- Special eligibility checkboxes
- Enterprise / B2B Partner tier with code verification
- Subscriptions monolith split
- PNG viewer fix

### Session Mar 6, 2026 — Security Hardening & Apple Readiness Audit
- Comprehensive End-to-End Lint (both frontend ESLint and backend ruff pass)
- Security Hardening (rate limiting, timing-safe OTP, encryption key failfast)
- Monolith Organization (DateMaskInput extraction)
- Security Scan Endpoint (GET /api/admin/security-scan, 41 automated checks)
- Dev Switcher regression fixes (2 separate issues resolved)
- CI/CD pipeline fix (ruff format)

### Session Mar 6, 2026 — Guided Activation Frosted Glass Overlay + IAC Fixes
- Frosted Glass Overlay (backdrop-filter: blur(16px)) on dashboard
- 5-Step Onboarding (create_message → upload_document → designate_primary → customize_checklist → review_readiness)
- Default IAC Items Fixed (5 items, beneficiary-focused)
- ReturnPopup on BeneficiariesPage and GuardianPage
- Celebration Overlay with frosted glass
- Personalized Step 1 with beneficiary names
- Dev Switcher production fix

### Session Mar 6, 2026 — P0 Verification (Current)
- **VERIFIED**: Frosted glass guided flow fully tested and working
  - Overlay renders correctly with step counter, icon, title, description
  - Skip button dismisses overlay
  - Close X button dismisses overlay
  - "Let's Go" button navigates to correct page
  - sessionStorage persistence prevents re-showing after dismissal
  - Backend /api/onboarding/progress returns correct step data
  - 100% pass rate on both backend and frontend tests

### Session Mar 6, 2026 — Bug Fixes (3 Issues)
- **Signup Progress Bubbles Fixed**: Removed truncated text labels from progress stepper circles. Now shows bold dark navy blue numbers (1, 2, 3...) inside gold circles for completed/active steps, grey for future steps. No more garbled labels.
- **Video Thumbnail/Poster Fixed**: After recording a video in Messages, a poster thumbnail is now generated from the first frame of the recorded video blob (using canvas capture). The `poster` attribute is set on the `<video>` element for reliable cross-browser display. Also generates poster when loading existing videos for editing.
- **IAC Errors Fixed**: Added `activation_status`, `is_default`, `ai_accepted`, and `is_completed` fields to `ChecklistItemUpdate` Pydantic model. Also added `is_default`, `activation_status`, `ai_accepted` to `ChecklistItem` model. Previously, updating `activation_status` via PUT returned 400 "No fields to update" because the field was silently dropped by Pydantic validation.

### Session Mar 6, 2026 — Smooth Transitions & Light Mode
- **Dashboard Flash Prevention**: Onboarding progress check now runs in parallel with estate data fetch (not sequentially after). Dashboard content stays opacity:0 until `dashboardReady` state is set via `requestAnimationFrame`, preventing flash of dashboard content before overlay appears.
- **Smoother Overlay Animations**: Guided overlay uses 0.8s cubic-bezier fade-in (up from 0.5s ease). Bubble content animates in with spring-like easing and 0.2s delay.
- **Light Mode Support**: All hardcoded dark colors in guided overlay, celebration overlay, and ReturnPopup replaced with CSS custom properties (`--guided-overlay-bg`, `--guided-title`, `--guided-desc`, etc.). Light mode variants defined in `[data-theme="light"]` block in `index.css`.
- **ReturnPopup Light Mode**: Frosted glass backdrop, title text, subtitle text, and button borders all use CSS variables for theme awareness.

### Session Mar 6, 2026 — Overlay Behavior Fixes (3 Bugs)
- **X Button Bounce-Back Fixed**: Root cause was `useEffect([estate])` triggering infinite re-runs of `fetchEstateData` (because `setEstate` creates new object refs), causing a race condition that re-set `showGuidedFlow=true` after X dismissed it. Fixed by changing dependency to `[estate?.id]`.
- **Skip No Longer Permanently Kills Panes**: Removed `sessionStorage('carryon_activation_done')` entirely. Replaced with a `useRef(guidedDismissedRef)` that resets on component re-mount. X and Skip now dismiss only for the current page visit; navigating away and back re-checks onboarding progress.
- **Dashboard Flash Eliminated**: Added double `requestAnimationFrame` before setting `dashboardReady`, ensuring the overlay has time to render before the dashboard content fades in.

### Session Mar 6, 2026 — DTS Delete + Toast Fix + IAC Errors
- **DTS Delete Button**: Added "Danger Zone" card with "Delete Request" button in DTS detail view. Clicking opens admin password confirmation modal (same pattern as user delete). Backend `DELETE /dts/tasks/{task_id}` now requires `admin_password` query param for admin users.
- **Toast Z-Index Fix**: Toaster component z-index raised to 99999 (from default) so error toasts appear above all modals (Dialog z-50, overlays z-[200]). Users can now see and dismiss toast errors even when a modal is open.
- **IAC Errors**: The stacking errors from activation_status updates were fixed in a previous session (model fields added). The z-index fix ensures any remaining toast errors are interactable.

### Session Mar 6, 2026 — Major Batch: 6-Step Onboarding, Sidebar Reorder, EGA + MM Improvements
- **New DAV Step (add_credential)**: Added Step 5 "Store a Digital Account Credential" to onboarding flow (now 6 total). Backend onboarding.py updated with step definition and completion check (`db.credentials.count_documents`). DigitalWalletPage shows ReturnPopup after first credential saved.
- **Sidebar Reorder**: Menu now: Dashboard, MM, SDV, IAC, DAV, EGA, DTS, Beneficiaries, Legacy Timeline.
- **Step Counter Font**: Increased to text-xl/text-2xl (60% of title size), bold uppercase.
- **Name Format**: Frosted glass step 1 now shows "Name 1, Name 2, and/or Name 3" for personalized messaging.
- **Congrats Pane Fix**: Now triggers from `fetchEstateData` when `all_complete` is true. Uses `sessionStorage('carryon_celebration_shown')` to prevent repeats. Added "re-enable in Settings" note.
- **EGA Quick Actions**: Changed from flex-wrap to 2-column grid. Buttons fill tiles and are centered. Removed border-top line above prompt.
- **Voice-to-Text**: Working mic buttons added to EGA landing input (Web Speech API), EGA chat input, and Messages page content textarea ("Dictate Message"). Continuous recognition with interim results.
- **Copy Button**: Added to all EGA assistant message responses.
- **Persistent Return Button**: Pulsing gold "Return to Dashboard to complete onboarding" button shows only during Getting Started flow after first EGA response. Never shows again after onboarding.
- **Signup Underlines**: "Adult" in "Adult Dependent 1" and "Minor" in "Minor Dependent 1" now underlined with gold for clarity.
- **Address Input Fix**: AddressAutocomplete now accepts className prop for consistent input heights.

### Session Mar 6, 2026 — Critical Crash Fix (add_credential)
- **VERIFIED & TESTED**: Fixed critical crash caused by missing `add_credential` config in `OnboardingWizard.js` STEP_CONFIG object. Added KeyRound icon, cyan color (#06b6d4), /digital-wallet route, label, and description. Added null guard (`if (!config) return null`) as defensive fallback.
- **CI/CD Linting**: Both `ruff format . --check` and `ruff check .` pass cleanly (85 files formatted).
- **Test Results**: 100% pass rate — dashboard loads correctly, onboarding wizard renders "4 of 6 complete", guided overlay shows "STEP 3 OF 6".
- **DAV Step Completion Bug Fixed**: Backend `onboarding.py` was checking `db.credentials` (non-existent collection) instead of `db.digital_wallet` for `add_credential` step completion. Fixed to use correct collection name. Verified: step now correctly marks as DONE when a DAV entry exists.
- **Post-Celebration Wizard Auto-Hide**: After the Congrats celebration is dismissed, the Getting Started wizard now returns `null` (hides completely) instead of rendering all completed steps. User can re-enable via Settings.

### Session Mar 6, 2026 — Apple IAP Integration (Guideline 3.1.1 Fix)
- **Apple Rejection Fix**: App was rejected because subscriptions were only purchasable via Stripe (external payment). Added Apple In-App Purchase flow for native iOS app.
- **Frontend Integration**: `SubscriptionPaywall.js` now detects native iOS via `isNative && platform === 'ios'`, uses `purchaseIAP()` from `iap.js` instead of Stripe checkout. Added "Restore Purchases" button (Apple requirement).
- **Backend Fix**: Receipt validation endpoint (`/subscriptions/validate-apple-receipt`) was writing to wrong collection (`db.subscriptions` instead of `db.user_subscriptions`). Fixed to use `db.user_subscriptions` with `upsert=True`, matching the Stripe flow.
- **Shared Secret**: Added `APPLE_SHARED_SECRET` to backend `.env` for future receipt verification.
- **Info.plist Fix**: Removed erroneous `NSExtension` block from main app Info.plist that was causing CodeMagic "Validation failed" publish errors. Added `NSSpeechRecognitionUsageDescription`.
- **Rate Limit**: Auth endpoints loosened from 10 → 30 requests/min for development.

## Pending / Backlog
- P0: Mobile App rubber-banding/blank screen (Codemagic build validation pending)
- P1: In-App Viewer for PNG Images (triggers download instead of viewer)
- P1: VAPID keys on Railway for push notifications
- P1: Codemagic build for native Face ID testing
- P1: Apple Passkeys ("Sign in with Passkey")
- P1: Share Extension — full native setup (iOS Share Extension target in Xcode)
- P1: Operations Admin Page for Chief of Staff (everything except revenue analytics)
- P2: Animated logo (awaiting asset)
- P2: SMS OTP via Twilio (awaiting A2P 10DLC)
- P2: ISO 27001 full compliance
- P2: Beneficiary Hub & Gentle Intro Verification (user testing pending)
- P3: Redis-backed rate limiting

## Backlog (Post v1.0 Approval)
- **P1: Apple Passkeys** — Add "Sign in with Passkey" via `@argo-navis-dev/capacitor-passkey-plugin`
- **P1: Share Extension** — iOS Share Extension target in Xcode
- **P1: Operations Admin Page** — Separate admin portal for Chief of Staff
- **P2: Will Creation Wizard** — TurboTax-style guided will creation
- **P2: OCR Document Scanning** — Camera-to-vault with text extraction
- **Twilio SMS OTP** — Waiting on A2P 10DLC approval

## Test Credentials
- **Admin**: info@carryon.us / Demo1234!
- **Benefactor Test**: fulltest@test.com / Password.123
- **Benefactor Demo**: demo@carryon.us / Demo1234!
