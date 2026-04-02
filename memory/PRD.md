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
- **Status**: RE-FIXED (April 2, 2026) - Added activeChannelRef guard
- **Approach**: `100dvh` CSS height + visualViewport resize handler + scroll compensation via transform
- **Key change**: Keyboard handler now uses `activeChannelRef.current` to skip entirely when on channel list
- **Key**: Only apply `translateY(scrollY)` when keyboard IS open AND activeChannel exists
- **DO NOT**: Apply viewport transforms when on the channel list (no active chat)
- **DO NOT**: Use `setInterval` polling - causes scroll jank
- **DO NOT**: Use `window.scrollTo(0,0)` on every scroll event - fights iOS
- **DO NOT**: Use `body { position: fixed }` or `overflow: hidden` on body/html

### 4. SDV Document Download with File Extension
- **Status**: FIXED (April 2, 2026) - Added file extension to download filename
- **Root cause was**: `doc.name` had no extension (e.g., "My Will" not "My Will.pdf"), iOS share sheet rejected extensionless files
- **Fix**: Frontend `resolveFileName()` adds extension based on MIME type. Backend also adds extension in Content-Disposition header
- **Files**: `VaultPage.js` (handleDownload + resolveFileName), `routes/documents.py` (download_document)
- **DO NOT**: Return filenames without extensions in Content-Disposition
- **DO NOT**: Revert to proxy-based downloads for SDV

### 5. Video MM Download (iOS PWA) - CONFIRMED WORKING
### 6. Text MM PDF Download (iOS PWA) - CONFIRMED WORKING
### 7. ECT Beneficiary Avatars - CONFIRMED WORKING
### 8. CCP Plan PDF Download - CONFIRMED WORKING
### 9. MM Download Progress Indicators - IMPLEMENTED
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
