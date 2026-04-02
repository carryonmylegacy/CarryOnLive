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
**User deploys via GitHub → Railway (backend) + Vercel (frontend), tests on carryon.us via iOS/PWA.**

---

## LOCKED-IN FEATURES — DO NOT REGRESS

### 1. Download Token System (MongoDB-backed)
- **Status**: FIXED (April 2, 2026) — moved from in-memory to MongoDB
- **Root cause was**: In-memory dict lost tokens on Railway restarts/multi-instance
- **Files**: `services/download_tokens.py`, `routes/downloads.py`
- **DO NOT**: Revert to in-memory `_tokens` dict

### 2. ECT Channel List
- **Status**: FIXED (April 2, 2026) — `NoneType` crash in sort lambda
- **Root cause was**: `c.get("last_message", {}).get(...)` — when `last_message` is `None` (not `{}`), `.get()` crashes. The API returned 500, `fetchChannels` swallowed the error silently. Channels never loaded.
- **Fix**: `(c.get("last_message") or {}).get(...)`
- **Files**: `routes/estate_chat.py` line 373
- **DO NOT**: Use `dict.get(key, {}).get(...)` pattern without `or {}` guard — MongoDB stores `null` not `{}`

### 3. ECT iOS Keyboard Handling
- **Status**: RE-IMPLEMENTED (April 2, 2026)
- **Approach**: `100dvh` CSS height + visualViewport resize handler + scroll compensation via transform
- **Key**: Only apply `translateY(scrollY)` when keyboard IS open. Listen to `resize` + `scroll` on visualViewport.
- **DO NOT**: Use `setInterval` polling — causes scroll jank
- **DO NOT**: Use `window.scrollTo(0,0)` on every scroll event — fights iOS
- **DO NOT**: Use `body { position: fixed }` or `overflow: hidden` on body/html

### 4. Video MM Download (iOS PWA) — CONFIRMED WORKING
### 5. Text MM PDF Download (iOS PWA) — CONFIRMED WORKING
### 6. ECT Beneficiary Avatars — CONFIRMED WORKING
### 7. CCP Plan PDF Download — CONFIRMED WORKING
### 8. MM Download Progress Indicators — IMPLEMENTED
### 9. ECT Channel List Refresh on Back-out — IMPLEMENTED

---

## Blocked Items
- **Apple IAP**: Waiting on Paid Applications Agreement
- **Twilio SMS OTP**: Waiting on A2P 10DLC approval

## Prioritized Backlog

### P0
- SDV Download error investigation — improved error messages deployed, awaiting user feedback
- ECT Keyboard — awaiting user verification on iOS device

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
- **Downloads**: ALL file downloads MUST go through `platformDownload()`.
- **Railway Build**: `requirements.txt` MUST have `--extra-index-url` as first line.
- **ECT Avatars**: Always use `resolve_photo_url()`.
- **MongoDB null safety**: Always use `(doc.get("field") or {}).get(...)` instead of `doc.get("field", {}).get(...)` — MongoDB stores explicit `null` which overrides the default `{}`.
