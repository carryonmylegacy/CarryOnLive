# CarryOn - Estate Planning Application

## ZERO TOLERANCE: Perfect Code Every Push
**MANDATORY: Before EVERY push, run `bash /app/housekeeping.sh`. ALL 60 checks must PASS.**

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
- **Files**: `utils/downloadFile.js` (platformDownload → always promptToSave), `MessagesPage.js` (downloadingId state + Loader2 spinner)
- **DO NOT**: Add back `navigator.share()` before `promptToSave` — user gesture always expires during async download

### 6. ECT Toast Import
- **Status**: FIXED (April 2, 2026) — Changed from `import { toast } from 'sonner'` to `import { toast } from '../utils/toast'`
- **Root cause**: sonner's toast calls are invisible when the app uses a custom toast system
- **Files**: `EstateChatPage.js` line 5
- **DO NOT**: Import toast from 'sonner' in pages — always use `../utils/toast`

### 7. ECT Swipe-to-Delete Channels
- **Status**: FIXED (April 2, 2026) — backend permissions + CORS preflight fix + **circle channels blocked from swipe-to-delete**
- **Circle protection**: `handleTouchEnd` checks `ch?.type === 'circle'` and returns early, preventing swipe-to-delete on estate circle channels
- **Header trash icon**: Already gated with `activeChannel.type === 'group'` only

### 8. ECT Channel List Refresh on Back-out - IMPLEMENTED
### 9. CCP Plan PDF Download - CONFIRMED WORKING
### 10. ECT Beneficiary Avatars - CONFIRMED WORKING

### 11. Customizable Dock (Bottom Nav)
- **Status**: IMPLEMENTED (April 2, 2026)
- **Backend**: `routes/user_preferences.py` — GET/PUT `/api/user-preferences/dock`
- **Frontend**: `components/DockCustomizer.js` — UI for selecting/reordering 5 dock items
- **Integration**: `MobileNav.js` — exports `DOCK_REGISTRY`, fetches custom preferences, resolves items in `getBottomNav()`
- **Settings**: Added to both `SettingsPage.js` and `BeneficiarySettingsPage.js`
- **Roles**: All roles supported (benefactor, beneficiary, admin, operator)

---

## Blocked Items
- **Apple IAP**: Waiting on Paid Applications Agreement
- **Twilio SMS OTP**: Waiting on A2P 10DLC approval

## Prioritized Backlog

### P0
- ECT Keyboard + ECT Delete + MM Download - FIXES DEPLOYED, awaiting user iOS verification
- Customizable Dock - IMPLEMENTED, awaiting user verification

### P1
- Google Play Store Launch (operational steps)
- Share Extension Setup
- iOS Live Updates (Capgo)
- ECT Beneficiary Avatars fix (if still broken after user testing)

### P2
- Readiness Scoring Policy Page
- Scalability Enhancements

### P3
- ECT Security Comparison Landing Page at `/security`

## Critical Notes
- **Downloads**: ALL file downloads MUST go through `platformDownload()` with `promptToSave` (never direct `navigator.share`)
- **Railway Build**: `requirements.txt` MUST have `--extra-index-url` as first line
- **ECT Avatars**: Always use `resolve_photo_url()`
- **MongoDB null safety**: Always use `(doc.get("field") or {}).get(...)` instead of `doc.get("field", {}).get(...)`
- **ECT Keyboard**: Always check `activeChannelRef.current` before applying viewport transforms
- **Toast import**: Always use `../utils/toast`, never `sonner` directly
- **SDV Filenames**: Always include file extension based on MIME type
