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
- **Status**: FIXED (April 2, 2026) - moved from in-memory to MongoDB
- **Root cause was**: In-memory dict lost tokens on Railway restarts/multi-instance
- **Files**: `services/download_tokens.py`, `routes/downloads.py`
- **DO NOT**: Revert to in-memory `_tokens` dict

### 2. ECT Channel List
- **Status**: FIXED (April 2, 2026) - `NoneType` crash in sort lambda
- **Root cause was**: `c.get("last_message", {}).get(...)` - when `last_message` is `None` (not `{}`), `.get()` crashes
- **Fix**: `(c.get("last_message") or {}).get(...)`
- **Files**: `routes/estate_chat.py` line 373
- **DO NOT**: Use `dict.get(key, {}).get(...)` pattern without `or {}` guard

### 3. ECT iOS Keyboard Handling
- **Status**: RE-FIXED (April 2, 2026) - Switched from `height: 100dvh` to `top:0; bottom:0` with `bottom` adjustments
- **Approach**: `position:fixed; top:0; bottom:0` (no `100dvh`!) + visualViewport resize handler + `bottom` adjustment for keyboard + scroll compensation via transform
- **Key change**: Uses `root.style.bottom = kbHeight + 'px'` instead of `root.style.height`. `100dvh` was unreliable on iOS PWA. Keyboard handler checks `document.activeElement` — only activates when INPUT/TEXTAREA is focused. `focusout` safety resets bottom after 400ms delay.
- **DO NOT**: Use `height: 100dvh` — it's unreliable on iOS PWA standalone mode
- **DO NOT**: Apply viewport transforms when on the channel list (no active chat)
- **DO NOT**: Add `onMouseDown={e => e.preventDefault()}` on the mic button
- **DO NOT**: Use `setInterval` polling, `body { position: fixed }`, or `overflow: hidden` on body/html

### 4. SDV Document Download via Download Proxy
- **Status**: RE-FIXED (April 2, 2026) — Switched from direct fetch to `platformDownload` utility
- **Root cause was**: Direct `fetch()` + `navigator.share()` fails on iOS PWA because user gesture expires during async fetch. The `promptToSave` overlay in `platformDownload` re-establishes user activation.
- **Fix**: VaultPage now calls `platformDownload({ action: 'document', params: { document_id } })` which uses the MongoDB-backed download proxy tokens
- **Files**: `VaultPage.js` (handleDownload), `downloadFile.js` (platformDownload + promptToSave), `downloads.py` (prepare + execute)
- **DO NOT**: Use direct `fetch()` + `navigator.share()` for downloads on iOS — user activation expires
- **DO NOT**: Revert to in-memory download tokens
- **DO NOT**: Remove the `promptToSave` overlay from `downloadFile.js`

### 5. Video MM Download (iOS PWA) - CONFIRMED WORKING
### 6. Text MM PDF Download (iOS PWA) - CONFIRMED WORKING
### 7. ECT Beneficiary Avatars - CONFIRMED WORKING
### 8. CCP Plan PDF Download - CONFIRMED WORKING
### 9. MM Download Progress Indicators — FIXED
- **Status**: RE-FIXED (April 2, 2026) — `toast.loading()` TypeError crash + play button confusion + yellow toast confusion
- **Root cause was**: Custom toast utility replaced sonner but did NOT implement `.loading()` or `.dismiss()` methods. Added shims. Removed intermediate progress toasts that confused users with "yellow" (gold-bordered info toasts). Changed `promptToSave` overlay's play icon (▶) to download arrow (↓) since users expected play functionality.
- **Files**: `utils/toast.js`, `MessagesPage.js` (handleDownload), `utils/downloadFile.js` (promptToSave)
- **DO NOT**: Call `toast.loading()` without the shim. Use `toast.info()` instead.
### 10. ECT Channel List Refresh on Back-out - IMPLEMENTED
### 11. ECT Swipe-to-Delete Channels - IMPLEMENTED

---

## Blocked Items
- **Apple IAP**: Waiting on Paid Applications Agreement
- **Twilio SMS OTP**: Waiting on A2P 10DLC approval

## Prioritized Backlog

### P0
- SDV Download + ECT Keyboard + ECT Scroll - FIXES DEPLOYED, awaiting user iOS verification

### P1
- Google Play Store Launch (operational steps)
- Share Extension Setup
- iOS Live Updates (Capgo)

### P2
- Readiness Scoring Policy Page
- Scalability Enhancements

### P3
- ECT Security Comparison Landing Page at `/security`

## Critical Notes
- **Downloads**: ALL file downloads MUST go through `platformDownload()` OR direct fetch with proper extension.
- **Railway Build**: `requirements.txt` MUST have `--extra-index-url` as first line.
- **ECT Avatars**: Always use `resolve_photo_url()`.
- **MongoDB null safety**: Always use `(doc.get("field") or {}).get(...)` instead of `doc.get("field", {}).get(...)`.
- **ECT Keyboard**: Always check `activeChannelRef.current` before applying viewport transforms.
- **SDV Filenames**: Always include file extension based on MIME type in both frontend (resolveFileName) and backend (Content-Disposition).
