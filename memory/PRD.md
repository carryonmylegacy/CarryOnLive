# CarryOn - Estate Planning Application

## ZERO TOLERANCE: Perfect Code Every Push
**MANDATORY: Before EVERY push, run `bash /app/housekeeping.sh`. ALL 65 checks must PASS.**
**MANDATORY: After EVERY testing agent call, run `cd /app/backend && ruff format . && ruff check .` — testing agents create files with trailing whitespace that fail Vercel CI.**


---

## DO NOT TOUCH — ECT Chat View Transition Settling (iOS PWA)

**Priority: DOCUMENTED PERMANENT — DO NOT ATTEMPT TO FIX**

**Issue**: When tapping a channel to open a chat on iOS PWA, the entire chat view (header + message area + input bar) slides up then ratchets down into position before settling. The text input bar may also appear with a slight delay or flash into position separately.

**What was tried (April 3, 2026) — ALL FAILED, ZERO EFFECT:**

1. **Clearing CSS transitions** on `ect-root` in `openChannel()` — `r.style.transition = 'none'` before resetting transform/bottom. **No effect.**
2. **`visibility: hidden` + double-`requestAnimationFrame` reveal** — hide ect-root during DOM swap, reveal after browser completes layout+paint. **Made keyboard behavior WORSE — header jumped twice, input bar ratcheted.**
3. **`willChange: 'transform'`** on ect-root to force GPU compositing layer. **Made keyboard behavior WORSE (same as #2, applied together).**
4. **`window.scrollTo({ behavior: 'instant' })`** instead of `scrollTo(0,0)`. **Made keyboard behavior WORSE (same as #2/#3, applied together).**
5. **`animation: fadeIn 0.12s ease-out`** CSS opacity mask on messageArea container. **No effect.**
6. **`min-height: 0` (`min-h-0`)** on the messages scroll container to fix iOS flex sizing bug. **No effect.**
7. **CSS Grid** (`display: grid; grid-template-rows: auto 1fr auto auto`) instead of Flexbox on messageArea to force single-pass layout. **No effect.**
8. **Removing `window.scrollTo(0, 0)`** from `openChannel()` entirely. **No effect.**
9. **DOM persistence** — keeping both channelPanel and messageArea always in the DOM and toggling with CSS `display: none`/`flex` classes instead of React ternary swap. Eliminates DOM insertion/removal entirely. **No effect.**
10. **Fixed wrapper + absolute inner** — wrapping `ect-root` in a `position: fixed` parent and changing `ect-root` to `position: absolute`. Standard iOS developer workaround for fixed-element rendering bugs. **No effect.**

**Conclusion**: This is an iOS Safari rendering behavior with `position: fixed` containers that cannot be resolved through CSS, JavaScript, DOM strategy, or positioning changes made remotely. Every approach — from CSS transitions to GPU compositing to DOM mutation avoidance to positioning strategy changes — produced either zero effect or made the keyboard behavior worse. The settling animation is baked into how iOS Safari handles content changes inside fixed-position elements.

**Cost**: Thousands of tokens and multiple screen recordings were spent reaching this conclusion. **DO NOT re-attempt any of the above fixes or variations thereof.** Any future agent encountering this issue must read this section first and not repeat these approaches.

**The only approaches NOT tried** (and may warrant future investigation with physical device access):
- Native iOS WKWebView configuration flags
- Capacitor-level viewport management plugins
- Replacing `position: fixed` entirely with a different layout paradigm (e.g., full-page CSS Grid with no fixed positioning)

---
## Original Problem Statement
A full-stack estate planning application allowing benefactors to manage digital estates, beneficiaries, documents, and messages.

## Core Architecture
- **Frontend**: React (CRA) + Shadcn/UI + TailwindCSS + Capacitor (iOS/Android)
- **Backend**: FastAPI + MongoDB (motor async)
- **Auth**: JWT-based with optional OTP
- **Storage**: AWS S3 (presigned URLs)
- **Integrations**: xAI (Grok), Stripe, Apple IAP, AWS S3, Resend, Google Places, Capgo

## CRITICAL: User Deployment & Testing Workflow
**User deploys via GitHub -> Railway (backend) + Vercel (frontend), tests on carryon.us via iOS/PWA.**

---

## LOCKED-IN FEATURES - DO NOT REGRESS

### 1. Download Token System (MongoDB-backed)
- **Status**: FIXED (April 2, 2026)
- **Files**: `services/download_tokens.py`, `routes/downloads.py`
- **DO NOT**: Revert to in-memory `_tokens` dict

### 2. ECT Channel List
- **Status**: FIXED (April 2, 2026)
- **Fix**: `(c.get("last_message") or {}).get(...)`
- **Files**: `routes/estate_chat.py`
- **DO NOT**: Use `dict.get(key, {}).get(...)` pattern without `or {}` guard

### 3. ECT iOS Keyboard Handling
- **Status**: RE-FIXED (April 2, 2026) — `top:0; bottom:0` + visualViewport + window scroll listener + CSS transition
- **Approach**: `position:fixed; top:0; bottom:0` (no `100dvh`!) + visualViewport resize handler + `bottom` adjustment for keyboard + scroll compensation via transform + **window scroll listener** for iOS PWA scroll compensation + **CSS `transition: bottom 0.15s ease-out`** to smooth keyboard animation + **delayed scrollTo(0,0)** on input focus (150ms, 350ms)
- **DO NOT**: Use `height: 100dvh` — it's unreliable on iOS PWA standalone mode
- **DO NOT**: Apply viewport transforms when on the channel list (no active chat)
- **DO NOT**: Add `onMouseDown={e => e.preventDefault()}` on the mic button
- **DO NOT**: Use `setInterval` polling, `body { position: fixed }`, or `overflow: hidden` on body/html
- **DO NOT**: Use `setTimeout(sync, ...)` delayed re-syncs — they cause visible jitter as each fires at a different keyboard height

### 4. SDV Document Download via Download Proxy
- **Status**: RE-FIXED (April 2, 2026) — `platformDownload` utility
- **Files**: `VaultPage.js`, `downloadFile.js`, `downloads.py`
- **DO NOT**: Use direct `fetch()` + `navigator.share()` for downloads on iOS — user activation expires
- **DO NOT**: Revert to in-memory download tokens
- **DO NOT**: Remove the `promptToSave` overlay from `downloadFile.js`

### 5. MM Download — Always promptToSave (no double-tap)
- **Status**: RE-FIXED (April 2, 2026) — Removed initial `navigator.share()` attempt. Always goes straight to `promptToSave` overlay. Added **loading spinner** on download button during fetch.
- **Files**: `utils/downloadFile.js` (platformDownload -> always promptToSave), `MessagesPage.js` (downloadingId state + Loader2 spinner)
- **DO NOT**: Add back `navigator.share()` before `promptToSave` — user gesture always expires during async download

### 6. ECT Toast Import
- **Status**: FIXED (April 2, 2026) — Changed from `import { toast } from 'sonner'` to `import { toast } from '../utils/toast'`
- **Root cause**: sonner's toast calls are invisible when the app uses a custom toast system
- **Files**: `EstateChatPage.js` line 5
- **DO NOT**: Import toast from 'sonner' in pages — always use `../utils/toast`

### 7. ECT Swipe-to-Delete Channels
- **Status**: RE-FIXED (April 2, 2026) — backend permissions + CORS preflight fix + circle deletion enabled + **dismissal tracking**
- **Circle channels**: Swipe-to-delete works for ALL channel types. Circles are **dismissed per-user** (not hard-deleted) so they stay hidden even after `_ensure_circle()` auto-recreation. Non-circle channels are both dismissed AND hard-deleted.
- **New collection**: `estate_channel_dismissals` — `{user_id, channel_id, dismissed_at}` — unique index on `(user_id, channel_id)`
- **Un-dismiss**: When a new message is sent to a dismissed channel, all dismissals for that channel are cleared (channel reappears)
- **Header trash icon**: Only shows for group channels (`activeChannel.type === 'group'`)
- **DO NOT**: Re-add `if channel["type"] == "circle"` restriction on the backend
- **DO NOT**: Hard-delete circle channels (they auto-recreate, defeating the purpose)

### 8. ECT Channel List Refresh on Back-out - IMPLEMENTED
### 9. CCP Plan PDF Download - CONFIRMED WORKING
### 10. ECT Beneficiary Avatars - FIXED (April 3, 2026)
- **Root Cause**: Frontend had `.startsWith('http')` filter on `photo_url`, which excluded `data:image/...` base64 URLs stored by some users
- **Fix**: Removed `.startsWith('http')` check at 3 locations (contact modal, channel list, chat header) — now accepts any truthy `photo_url`
- **Files**: `EstateChatPage.js` lines ~904, ~1174, ~1219
- **DO NOT**: Re-add `startsWith('http')` filter — `resolve_photo_url()` already handles all URL types

### 11. Customizable Dock (Bottom Nav)
- **Status**: IMPLEMENTED (April 2, 2026)
- **Backend**: `routes/user_preferences.py` — GET/PUT `/api/user-preferences/dock`
- **Frontend**: `components/DockCustomizer.js` — UI for selecting/reordering 5 dock items
- **Integration**: `MobileNav.js` — exports `DOCK_REGISTRY`, fetches custom preferences, resolves items in `getBottomNav()`
- **Settings**: Added to both `SettingsPage.js` and `BeneficiarySettingsPage.js`
- **Roles**: All roles supported (benefactor, beneficiary, admin, operator)

### 12. ECT Bulk Delete Conversations
- **Status**: IMPLEMENTED (April 2, 2026)
- **Backend**: `routes/estate_chat.py` — `POST /api/estate-chat/channels/batch-delete` accepts `{channel_ids: [...]}`, returns `{deleted: [...], failed: [...]}`
- **Frontend**: `EstateChatPage.js` — Select mode toggle (CheckSquare2 icon) in header + long-press gesture (500ms hold), checkboxes on channels, Select All/Deselect All, bulk delete confirmation modal
- **Behavior**: Tap select button OR long-press any channel -> tap channels to select -> tap trash icon -> confirm -> done. Swipe-to-delete is disabled during select mode.
- **DO NOT**: Allow batch-delete of more than 50 channels in a single request

### 14. CCP Emergency Plan — Layout Fix & Beneficiary Assignment
- **Status**: IMPLEMENTED (April 3, 2026)
- **Layout**: Rendezvous Points and Resource Locations fields stacked vertically (Name on line 1, Address on line 2). `overflowX: hidden` on plan-edit container prevents horizontal slide.
- **Beneficiary Assignment**: New `assigned_beneficiary_ids` field on plans. `null` = all beneficiaries (default). Array of user IDs = specific beneficiaries only.
- **Backend filtering**: `GET /api/ccp/plans/{estate_id}` — benefactors see all plans; beneficiaries only see plans where `assigned_beneficiary_ids` is null OR contains their ID.
- **New endpoint**: `GET /api/ccp/members/{estate_id}` — returns estate members for the selector UI.
- **Status**: IMPLEMENTED (April 2, 2026)
- **Change**: Removed `<SubscriptionManagement />` from `SettingsPage.js` and `BeneficiarySettingsPage.js`
- **Reason**: Subscriptions have their own dedicated page; no need for duplication in Settings
- **DO NOT**: Re-add SubscriptionManagement to settings pages

### 15. Mobile/PWA Background Images — Gradient-Fade Banner (April 4, 2026)
- **Status**: FIXED
- **Issue**: Landscape background images (Pillars, Stepping Stones, Adult/Baby Hands) cropped poorly on mobile: `cover` was too zoomed in, `contain` was too small/meaningless.
- **Fix**: All three sections use a 280px tall banner at the top with `backgroundSize: 'cover'` and a `linear-gradient` fade to the section background color. Desktop retains full `inset-0` cover.
- **Sections**: Eight Pillars (`texture-pillars.jpg`), Five Steps (`texture-pathway.jpg`), Built for Real Families (`texture-families.jpg`)
- **File**: `components/landing/LandingContent.js`
- **DO NOT**: Revert to `contain` or full `inset-0 cover` on mobile for these landscape images

---

## Blocked Items
- **Apple IAP**: Waiting on Paid Applications Agreement
- **Twilio SMS OTP**: Waiting on A2P 10DLC approval

## Prioritized Backlog

### P0 — Username-Based Auth Migration (COMPLETED — April 7, 2026)
**Goal**: Switch from email-based login to username-based login. Email becomes non-unique (shared families). Beneficiaries join via invitation only.
- **23 touchpoints across 9 files** — validated by testing agent (17/17 backend, all frontend UI tests passed)
- **Housekeeping: 65/65 PASS**
- **Key changes**:
  - Username is the unique login identifier (not email)
  - Email is a non-unique communication channel (couples/families can share)
  - OTPs keyed by `user_id` instead of `email` (prevents collision)
  - Forgot-password uses username, not email
  - New `forgot-username` endpoint: sends username list to email
  - Signup is 3 steps: name → eligibility → credentials (with username)
  - Role selection removed (always benefactor)
  - Beneficiary self-signup removed (invitation-only)
  - Under-18 users blocked from direct signup with invitation message
  - 102 existing users auto-migrated with generated usernames
  - Login supports both username and email (username takes priority)
  - Shared-email users get "Multiple accounts use this email. Please use your username." error

### P0 — Immediate Follow-On (Post-Auth Migration)
These items come from real user beta feedback and should be addressed immediately after the auth migration:

1. **DOB Auto-Slashes on Mobile** (Low effort) — `DateMaskInput.js` auto-inserts `/` on desktop but may not work consistently on mobile web. Test and fix `inputMode="numeric"` behavior across mobile browsers.
2. **Beneficiary Photo Purpose Hint** (Low effort) — Add tooltip/contextual hint on the beneficiary photo upload explaining: "Adding a photo helps your family instantly recognize each member across the platform."
3. **Beneficiary Email Change Notifications** (Medium effort) — When a beneficiary updates their email/profile, notify the benefactor via in-app notification + optional email: "[Name] updated their contact info."
4. **IAC "Accept" Button Tooltip** (Low effort) — Add `?` hover/info icon next to the Accept action explaining: "Accepting this task means you've reviewed it and confirmed it's relevant to your estate plan."
5. **IAC Collapsed/Prioritized View** (Medium effort) — Default: show only "Critical" items expanded. Collapse all other categories into accordion sections (e.g., "Financial (3 items)"). Progressive disclosure with "Show all tasks" toggle.
6. **Death Initiation UX Copy** (Low effort) — Rename/augment "Request Emergency Access" with more empathetic entry: "Report a Loved One's Passing." Add guided flow explanation.
7. **SEO Improvements** (Medium effort) — Add proper meta tags, structured data (JSON-LD), Open Graph tags. Add `robots.txt` and `sitemap.xml`. Ensure `<title>` includes "CarryOn - Secure Estate Planning" on every page. Improve discoverability for "CarryOn" searches.

### P0 (Previously Completed)
- ECT Keyboard + ECT Delete + MM Download - DEPLOYED
- Customizable Dock - IMPLEMENTED
- ECT Bulk Delete - IMPLEMENTED
- Dynamic Subscription Pricing Editor - IMPLEMENTED (April 3, 2026)
- Homepage rewrite - IMPLEMENTED (April 3, 2026)
- Landing Page Refactoring - IMPLEMENTED (April 3, 2026)
- Mobile/PWA Background Fix - IMPLEMENTED (April 4, 2026)
- ECT Member Dropdown - IMPLEMENTED (April 5, 2026)

### P1
- Google Play Store Launch (operational steps)
- Share Extension Setup
- iOS Live Updates (Capgo)

### P2
- Readiness Scoring Policy Page
- Scalability Enhancements

### P3
- ECT Security Comparison Landing Page at `/security`

---

## Username Auth Migration Plan (April 2026)

### Architecture Decision
- **Username** = unique login identifier (not an email, 3-30 chars, alphanumeric + underscores)
- **Email** = non-unique communication channel (OTP delivery, notifications)
- **Beneficiaries** = invitation-only (no self-signup)
- **OTPs** = keyed by `user_id` (not email) to prevent collision with shared emails
- **Auto-generated usernames** = `firstnamelastname` (lowercase, no dot, no spaces)
- **Migration** = existing users get auto-generated usernames with `needs_username_review: true`

### 23 Touchpoints (Validated by Testing Agent)
**Backend `models.py`**: UserCreate (add username, remove benefactor_email/role), ForgotPasswordRequest (email→username), ResetPasswordRequest (email→username)
**Backend `auth.py`**: check-email→check-username, remove check-benefactor-email, login (reverse lookup order), register (username uniqueness), OTP storage ×3 (email→user_id), verify-otp (resolve by identifier), resend-otp, forgot-password (username-based), reset-password (username-based), NEW forgot-username, verify-password, _user_response (include username), dev-login (support username)
**Backend `beneficiaries.py`**: invitations/accept (auto-generate username)
**Backend `webauthn.py`**: login-options (support username lookup — CAUGHT BY TESTING AGENT)
**Backend `family_plan.py`**: member lookup (use user_id — CAUGHT BY TESTING AGENT)
**Frontend**: SignupPage (remove role/benefactor_email steps, add username), LoginPage ×3 forgot-password modals (email→username, add forgot-username), AcceptInvitationPage (add username field), AuthContext (pendingEmail→pendingIdentifier)

## Critical Notes
- **Downloads**: ALL file downloads MUST go through `platformDownload()` with `promptToSave` (never direct `navigator.share`)
- **Railway Build**: `requirements.txt` MUST have `--extra-index-url` as first line
- **ECT Avatars**: Always use `resolve_photo_url()`
- **MongoDB null safety**: Always use `(doc.get("field") or {}).get(...)` instead of `doc.get("field", {}).get(...)`
- **ECT Keyboard**: Always check `activeChannelRef.current` before applying viewport transforms
- **Toast import**: Always use `../utils/toast`, never `sonner` directly
- **SDV Filenames**: Always include file extension based on MIME type
