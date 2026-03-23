# CarryOn - Estate Planning Application

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

### Completed (March 23, 2026 — Session 22: Tree Polish + Admin Lockout Fix)
- **Blue Tree = Inverted Gold Tree**: All blue lines fan from estate circle side-centers and converge to ONE point near Pete — exact mirror of gold tree geometry.
- **Animation Flow Reversed**: Blue path direction reversed so scroll-linked "light" animation flows top-to-bottom: from estate circles → Pete → beneficiary circles. Matches natural scroll direction.
- **Estate Circle Gap Closed**: Reduced upper section `circleR` from 7 to 6, bringing SVG endpoints closer to estate circle edges for tangential connection.
- **Halo Orb**: Added subdued bi-color radial glow behind Pete's circle — blue tint from above, gold tint from below. Fades out with distance, accentuates without overshadowing.
- **Gold Tree Preserved**: Reverted to original one-point fan pattern the user approved.
- **Admin Lockout Exemption**: Fixed bug where admin accounts hit 3-minute lockout when logging in via username — admin-check now queries both `email` and `username_lower`.
- **Housekeeping**: All 50 checks pass.

### Completed (March 22, 2026 — Session 21: SVG Gradual Curves + Mobile Grid Fix)
- **SVG Bezier Curves Softened**: Updated both blue (estate→benefactor) and gold (benefactor→beneficiary) strand paths in `FamilyTree.js` from sharp-elbowed curves to smooth, sweeping quarter-circle arcs using 0.42 bezier control point factors. Fixed critical bug where `sy` and `trunkX` variables were undefined in the blue strand path generation (would have crashed on render).
- **Mobile 2-Column Grid**: Ensured `BeneficiaryHubPage.js` estate tiles stay in 2 columns (`grid-cols-2`) at ALL viewport widths including narrowest PWA mode, expanding to 3 columns (`lg:grid-cols-3`) on desktop. Also fixed loading skeleton grid to match.
- **Testing**: Visual verification via screenshots at multiple viewports (340px, 380px, 600px).

### Completed (March 22, 2026 — Session 16: Admin Users Tab Tree View Overhaul)
- **Removed Ugly Tree Connector Lines**: Replaced rigid horizontal/vertical div-based tree connectors with a polished nested container design featuring 4px accent bars (purple for beneficiaries, blue for connected estates) at 50% opacity, tinted background containers, and clean row-based layouts.
- **Relationship Labels + Status Badges**: Expanded estates now show each beneficiary's relationship (Spouse, Son, Parent, etc.) and invitation status (Pending, Accepted, Draft) with color-coded badges.
- **Beneficiary-Centric Inverse View**: Clicking "Beneficiaries" filter flips the hierarchy — each beneficiary is root, with "Connected to X estates" expandable header showing connected benefactor estates underneath with blue accent styling.
- **Default Hierarchy Mode**: All role filters (All, Benefactors, Beneficiaries) now default to hierarchy view mode.
- **Graph View Softened**: Tree/graph view horizontal connectors reduced to 1px at 15% opacity for a more subtle look.
- **Testing**: 100% pass rate — iterations 137 & 138.

### Completed (March 22, 2026 — Session 15b: Single-Session Enforcement + Data Freshness)
- **Single-Session Login Blocking**: Non-admin users are now blocked from logging in on a second device while an active session exists. Clear "Signed in elsewhere" warning shown instead of generic "Invalid credentials." A "Sign In Here Instead" button allows force-login (ends the other session). Sessions older than 24h are treated as stale and don't block.
- **Logout Clears Session**: `POST /api/auth/logout` now clears `active_session_id` from the user document, allowing clean re-login from any device.
- **API Cache Cleared on Login/Logout**: `clearCache()` from `apiCache.js` is called on every login and logout to guarantee fresh data from MongoDB on the next session.
- **Dashboard/Checklist Polling Stability**: Replaced `getAuthHeaders` in useEffect dependency arrays with `getAuthHeadersRef` ref pattern to prevent effect re-creation on every render.
- **IAC Feedback Visibility**: Replaced tiny `text-xs` green badge with a prominent summary card showing "X new items added" (green) + "Y duplicates skipped" (amber). Added toast notifications for immediate visibility. Duplicate titles available via collapsible `<details>`.

### Completed (March 22, 2026 — Session 15a: EGA Real-Time Updates + Cross-Platform Downloads)
- **EGA IAC Duplicate Detection**: When generating IAC items, the system now tracks and reports duplicates. The `action_result` includes `duplicates_skipped` count and `duplicate_titles` list. The AI response summary shows how many items were skipped as duplicates.
- **EGA IAC Real-Time Polling**: New `ega_tasks` collection tracks IAC generation status (running/completed/error). New `GET /api/guardian/iac-task-status` endpoint returns the latest task status for the user's estate.
- **Dashboard Real-Time Updates**: DashboardPage polls `/api/guardian/iac-task-status` every 4 seconds. Shows a gold banner "Estate Guardian is generating IAC items" when EGA is running. Auto-refreshes estate data (stats, checklist counts) when generation completes.
- **Checklist Real-Time Updates**: ChecklistPage polls `/api/guardian/iac-task-status` every 4 seconds. Shows a gold banner when EGA is generating. Auto-refreshes checklist items when generation completes.
- **GuardianPage Duplicate Feedback UI**: When IAC generation returns duplicates, the chat message shows an amber info box listing the duplicate item titles with a count.
- **Cross-Platform Download Utility**: Created `/app/frontend/src/utils/downloadFile.js` — on web, triggers standard browser download; on iOS/Capacitor, writes to Documents directory via Filesystem API and opens the native Share sheet. All 5 PDF download handlers in GuardianPage updated to use this utility.
- **Testing**: 100% pass rate — all backend endpoints verified, all frontend pages load correctly with polling hooks active (iteration 135).

### Completed (March 22, 2026 — Session 14: Voice Biometric → PIN Replacement)
- **Voice Biometric Removed**: Completely removed voice biometric security feature (Layer 2) from both frontend and backend. Archived full implementation to `/app/memory/VOICE_BIOMETRIC_ARCHIVE.md` for future re-implementation.
- **PIN Security Layer Added**: New Layer 1 is a 4-8 digit PIN with on-screen numeric keypad (matching IntegrationsTab design). Keypad includes 0-9, Clear, Backspace buttons with gold-highlighted dot display.
- **Security Layer Reorder**: Layer 1 = PIN, Layer 2 = Password, Layer 3 = Security Question. Backend stores PIN as bcrypt hash (`pin_hash`), validates 4-8 numeric digits.
- **Unlock Modal Updated**: SectionLock.js unlock modal now shows PIN keypad step (instead of voice recording) with multi-step progress dots (PIN → Password → Q&A).
- **Migration Cleanup**: Backend `$unset`s all legacy voice fields (voiceprint, voiceprint_samples, voice_enabled, etc.) when saving section security settings.
- **Layer Wiring Bug Fixed**: Fixed critical bug where enabling one security layer caused the system to think all three were enabled.
- **Lock Banner Deep-Link to Settings**: Locked/unlocked section banners now show "Tap to add X more layer(s)" when fewer than 3 layers are configured.
- **Eyeball Icons**: Platform-wide vertical centering + `onMouseDown={e => e.preventDefault()}` to preserve mobile keyboard.
- **Vault Master Key Verification**: Security layer disable/toggle verification uses Vault Master Key (not account password).
- **Auto-Save Toggles**: Security layer toggles auto-save instantly to DB.
- **Settings Defaults**: Security sections default to collapsed on load.
- **Text Overflow Fix**: Master Key placeholder and Lock Dropdown truncated.

### Completed (March 21, 2026 — Session 13: CI Fix + iOS Modal Zoom Fix)
- CI Backend Lint Fix, CI Actions Upgrade, IntegrationsTab X Import Fix, iOS Safari Zoom Prevention.

### Completed (March 21, 2026 — Session 12: Tree Connector Lines + Collapsible Beneficiary Tiles)
- Admin Hierarchy View Lines Fix, Collapsible Beneficiary Tiles, Integrations Tab Unlocked + Editable.

### Completed (March 19, 2026 — Session 10)
- Beneficiary Color Coding, Apple Guideline 3.1.1 Fix, Global Font Minimum Sweep, Orbit Click Fix.

### Completed (March 19, 2026 — Session 9)
- Settings Page Reorganization, Per-User 2FA Toggle, Sort By in Admin UsersTab.

### Completed (March 18, 2026 — Session 8)
- DRY: API_URL Extraction, getAuthHeaders Consolidation, Dead CSS/Code Removal, Bug Fix: Beneficiary Login Lockout, Estate Name Personalization Prompt.

## P0/P1/P2 Prioritized Backlog

### P0
- **SVG Family Tree Visual Overhaul**: ✅ COMPLETED (Session 17+18+19+20)
  - Replaced rigid vertical/straight SVG connector lines with dynamic symmetric brush-stroke Bezier curves
  - Upper blue arcs (estates → benefactor) and lower gold arcs (benefactor → beneficiaries) now mirror each other
  - Branch centers of mass aligned with 2-column node layout centers (25%/75%)
  - No vertical branches sticking up from the middle (control point shift = 0.35)
  - **Scroll-Linked Fill Animation** (Session 19): Replaced CSS keyframe animations with JS scroll handler controlling `stroke-dashoffset` per scroll position. Auto-detects scrollable ancestor. Upper blue fills first (0-250px scroll), gold origin flash, lower gold fills (175-375px range). Fill is ratcheted (never reverses). Stays permanently once filled. Resets on unmount/remount.
  - **Visual refinements** (Session 19): 8 strands/bundle (was 5), thinner strokes (0.7px base, 1.0px overlay), reduced SVG height (vbH=50, was 80), toned-down brightness (~0.45 overlay opacity), smaller glow blur
  - **Neural/Dendritic Side-Emergence Geometry** (Session 20): Fundamental architecture change — SVG moved from a tiny strip below/above nodes to a full-height absolute-positioned overlay that covers the entire node grid. Strands now emerge HORIZONTALLY from inner sides of each circle, flow DOWNWARD through the center gap between the two columns (visible alongside nodes), merge into a central trunk, and end at the benefactor/beneficiaries. Uses `preserveAspectRatio="none"` for SVG stretching, normalized viewBox (0 0 100 100), dynamic row positioning, and wide column gaps (22% CSS grid gap). Handles centered (odd last) beneficiary. Flash circles positioned per node.
  - **Gradual Bezier Curves** (Session 21): Control point factors reduced to 0.42 (from 0.65) producing smooth quarter-circle-like arcs. Strands leave trunk vertically and arrive at nodes horizontally through a gradual, organic sweep — no visible "elbow" or squared-off turns.
  - **Single Strand + Trunk Architecture** (Session 21): Reduced from 3 strands/bundle to 1 single strand per node. All strands merge into ONE central trunk (not split left/right). Single smooth bezier per strand eliminates 90° junction artifacts. Strands connect at inner SIDE of each circle (nodeX + dir*circleR). Blue columns tightened to 18% gap (leftCol=21, rightCol=79). Blue convergence at Y=97 with trailPx=50 for visible trunk run to Pete. Both trunk endpoints flare out ±1.5 vb units near Pete. Desktop auto-animation fallback (600ms delay + rAF).
  - Uses `dangerouslySetInnerHTML` for SVG content to bypass Babel `<span>` wrapping
  - Applied same fix to UsersTab.js admin graph views

### P1
- **Share Extension Setup**: Re-add the Share Extension target in Xcode per `/app/memory/SHARE_EXTENSION_SETUP.md`
- **iOS Live Updates**: Test Capgo OTA update flow end-to-end

### P2
- **Video Playback on Milestone Page**: Recurring issue (3x) — debug media player for object storage URLs on Safari/iOS
- **Settings Page UI Glitch**: Investigate FOUC/suspense boundary issues
- **Readiness Scoring Policy Page**: Informational page under Account section
- **Scalability Enhancements**: Horizontal scaling, background workers, CDN
- **Refactor Large Files**: Break down LoginPage.js, SettingsPage.js, TrusteePage.js
- **Twilio SMS OTP**: Blocked on A2P 10DLC approval

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
