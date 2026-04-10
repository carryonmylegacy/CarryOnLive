# CarryOn - Family Preparedness Platform

## Original Problem Statement
Build and maintain a comprehensive family preparedness platform that helps users organize their estate plans, secure important documents, and leave messages for beneficiaries.

## Core Requirements
- Secure document vault with AES-256 encryption
- Milestone messaging (written, voice, video) 
- Beneficiary management with succession ordering
- AI-powered Estate Guardian advisor
- Immediate Action Checklist for beneficiaries
- Digital Access Vault for account credentials
- Guided onboarding / Getting Started flow
- Multi-role support (Benefactor, Beneficiary, Admin/Founder)
- iOS/PWA hybrid with Capacitor
- CarryOn Contingency Protocols (CCP) — family emergency plans
- Estate Communication Tool (ECT) — secure family chat

## Architecture
- Frontend: React (CRA + Craco) + Capacitor
- Backend: FastAPI + MongoDB
- Storage: S3-compatible object storage
- Auth: JWT + OTP + Passkeys
- Deployment: Vercel

## What's Been Implemented

### Completed (All Sessions)
- Full authentication system (JWT, OTP, passkeys, session enforcement)
- Beneficiary management with drag-to-reorder succession
- Milestone Messages (written, voice, video with S3 storage)
- Secure Document Vault (AES-256-GCM, voice unlock)
- Estate Guardian AI chat
- Immediate Action Checklist with AI generation
- Digital Access Vault
- Admin/Founder multi-portal system
- Stripe payments + Apple IAP integration
- Family Plan support
- Notification system (in-app + email)
- SEO (robots.txt, sitemap.xml, meta tags)
- State-sync audit (photo, video, voice deletion desyncs fixed)
- Narrative copy updated to "family preparedness"
- Getting Started UX Overhaul (foolproof for elderly/non-tech users)
- CCP First-Visit Welcome Walkthrough
- ECT Enhanced Security Intro
- xAI keepalive optimization (on-demand warmup)

### Completed (Current Session — Apr 8, 2026)
- **Invitation Existing Account Linking (P0)**: Fixed critical bug where existing users couldn't accept an invitation without hitting a "username taken" error.
  - Added `POST /api/invitations/accept-existing` endpoint in `beneficiaries.py`
  - Added "I Have an Account" toggle in `AcceptInvitationPage.js`
  - Fixed missing `verify_password` import (would have caused runtime crash)
  - Fixed stale `_xai_keepalive_task` import in `server.py` shutdown handler
  - Tested: 10/10 backend tests passed, all frontend flows verified
- **Family Tree Connector Line Fix**: Adjusted SVG path and CSS in `FamilyTree.js` so vertical lines stop at the top edge of beneficiary circles. Added flash animation at centered node endpoint.
- **Dual Homepage Video (Landscape + Vertical)**: Added responsive video embed on homepage.
  - Viewport < 768px shows vertical (9:16) YouTube embed; ≥ 768px shows landscape (16:9)
  - Both `HomePage.js` and `LoginPage.js` support the swap (LoginPage is primary landing)
  - Added `homepage_video_id_vertical` to backend platform settings
  - SiteContentTab in Founder Portal now has two inputs: Landscape (Desktop) and Vertical (Mobile) with live previews
  - Falls back to landscape video if no vertical video is set
- **Profile/Estate Photo Save Bug Fix**: Fixed field name mismatches preventing photos from persisting:
  - `ProfileCard.js`: Changed `res.data.profile_photo` → `res.data.photo_url` (matching backend response)
  - `EstatePhotoCard.js`: Changed `estates[0].photo` → `estates[0].estate_photo_url`
  - Added toast confirmations ("Profile photo saved" / "Estate photo saved") so users get feedback
  - Also fixed BeneficiarySettingsPage photo upload with proper response handling
- **Google Places Autocomplete Fix (Platform-Wide)**: Fixed React synthetic event bug in `AddressAutocomplete.js` where `e.target.value` was accessed inside a `setTimeout` after React recycled the event. This bug prevented autocomplete from working EVERYWHERE in the app. Also added AddressAutocomplete to PersonalInfoCard in Settings.
- **US Phone Auto-Formatting (Platform-Wide)**: Created shared `formatPhoneUS()` utility that strips the `+1` country code prefix. Applied `(XXX) XXX-XXXX` auto-formatting to ALL phone inputs AND display values across 13 files:
  - Settings Personal Info, Beneficiaries, Edit Beneficiary, Onboarding, Accept Invitation
  - FFN (Family & Friends), Checklist, Trustee Page, Emergency Access Panel
  - Founder Portal: Operators Tab (add + edit), P1 Contact Settings, Site Content footer phone
  - Display-only: SealedAccountScreen, ConnectedProtocolPage
- **Date of Birth Format Fix**: Replaced plain text input in PersonalInfoCard with `DateMaskInput` component (MM/DD/YYYY auto-formatting with `/` separators). Display mode converts YYYY-MM-DD from API to MM/DD/YYYY.
- **File Upload Accept Attributes**: Ensured all image uploads use `accept="image/*"` for macOS Photos sidebar. Fixed TransitionPage and VaultPage.

### Completed (Current Session — Apr 10, 2026)
- **Beneficiary Auto-Link on Login (P0)**: Fixed critical bug where a beneficiary who signed up directly (not via invitation link) would not get linked to their benefactor's estate tree. Added `_reconcile_beneficiary_by_email()` helper in `auth.py` that runs on every login path. It matches the user's email against unlinked beneficiary records, sets `user_id`, `invitation_status=accepted`, adds them to the estate's beneficiaries array, and sets `is_also_beneficiary` on the user. Replaced 4 scattered inline reconciliation blocks with the DRY helper. Tested: 4/4 assertions pass (user_id linked, status accepted, is_also_beneficiary set, added to estate array).
- **Beneficiary Pre-Transition Dock Defaults**: Changed default bottom dock for beneficiary portal from [Vault, Guardian, Dashboard, Messages, Checklist] to [Vault, Dashboard, CCP, Chat]. These are the only features available pre-transition.
- **Dock Customizer Grey-Out**: In Beneficiary Settings > Customize Dock, post-transition-only items (Guardian, Checklist, Messages, Milestone) are now greyed out with a lock icon and "Post-transition" badge. Tapping them shows a toast: "This feature becomes available after the estate is transitioned." The estate's transition status is detected via the section-permissions API.

## Blocked Items
- Apple IAP: Waiting on Paid Applications Agreement
- Twilio SMS: Waiting on A2P 10DLC campaign approval

## Upcoming Tasks
- (P0) Google Play Store Launch
- (P1) Share Extension Setup (iOS)
- (P1) iOS Live Updates (Capgo)

## Future/Backlog
- (P2) Readiness Scoring Policy Page
- (P3) ECT Security Comparison Landing Page

## Key Technical Notes
- Housekeeping: `bash /app/housekeeping.sh` must pass 65/65 before every push
- State sync: Frontend media removals must explicitly call backend DELETE endpoints
- Narrative: Use "family preparedness" not "estate planning"
- MongoDB: Always exclude `_id` from responses
- First-visit intros use localStorage: `carryon_ccp_intro_seen`, `ect_security_seen`
