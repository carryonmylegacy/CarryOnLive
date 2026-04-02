# CarryOn - Estate Planning Application

## ZERO TOLERANCE: Perfect Code Every Push
**This is the #1 rule of this project. No exceptions. No excuses.**
Every push to GitHub must be production-perfect. No artifacts, no hanging chads, no "it's just a small thing." Fix everything proactively — dirty git diffs, stale files, unused imports, console.logs, TODO comments, version drift, lock file noise — before declaring anything ready to push. The agent must catch and resolve ALL of these without being told. This project did not get here by accepting little bullshit things along the way. The standard is perfection. Every. Single. Time.

**MANDATORY: Before EVERY push, run `bash /app/housekeeping.sh` — the 60-check CarryOn Housekeeping Protocol + SOC 2 Compliance Audit. ALL 60 checks must PASS. Do NOT tell the user "ready to push" without running this script first. No exceptions. Ever.**

## Original Problem Statement
A full-stack estate planning application allowing benefactors to manage digital estates, beneficiaries, documents, and messages. Features role-based access (admin, benefactor, beneficiary), invitation system, orbit visualization for family connections, and Stripe/IAP subscriptions.

## Core Architecture
- **Frontend**: React (CRA) + Shadcn/UI + TailwindCSS + Capacitor (iOS/Android)
- **Backend**: FastAPI + MongoDB (motor async)
- **Auth**: JWT-based with optional OTP, supports login via username or email
- **Storage**: AWS S3 for documents AND photos (presigned URLs)
- **Integrations**: xAI (Grok), Stripe, Apple IAP, AWS S3, Resend, Google Places, Capgo, CodeMagic, Railway, Vercel

## CRITICAL: User Deployment & Testing Workflow
**The user ALWAYS pushes to GitHub, deploys through Railway (backend) and Vercel (frontend), and tests EXCLUSIVELY on their production site (carryon.us) via iOS/PWA. NEVER suggest "check the preview URL" or "push to GitHub to see changes" — they already do this every time.**

---

## LOCKED-IN FEATURES — DO NOT REGRESS

### 1. Download Token System (MongoDB-backed)
- **Status**: RE-IMPLEMENTED (April 2, 2026)
- **What**: Download tokens moved from in-memory dict to MongoDB collection `download_tokens`
- **Why**: In-memory tokens failed on Railway multi-instance deployments and restarts
- **Files**: `services/download_tokens.py` (async create/consume via MongoDB), `routes/downloads.py` (await calls)
- **Index**: `download_tokens.token` (unique), `download_tokens.created_at`
- **DO NOT**: Revert to in-memory `_tokens` dict

### 2. ECT iOS Keyboard / Visual Viewport Handling
- **Status**: RE-IMPLEMENTED (April 2, 2026)
- **Approach**: Height-only resizing + scroll prevention. NO transforms.
- **Key behavior**: `vv.height` sets container height when keyboard is open. `window.scrollTo(0, 0)` kills page scroll immediately.
- **Safe-area**: Separate `#151D30` div below input bar when keyboard is closed
- **Input bar**: Always has `paddingBottom: 8px` (identical look regardless of keyboard state)
- **DO NOT**: Use `transform: translateY` — causes ratchet/jitter on iOS
- **DO NOT**: Use `setInterval` polling — causes scroll jank
- **DO NOT**: Use `body { position: fixed }` or `overflow: hidden` on body/html
- **DO NOT**: Use `scrollIntoView` — scrolls entire window on iOS PWA
- **DO NOT**: Re-add `backdrop-filter: blur()` or translucent backgrounds on input bar
- **Files**: `EstateChatPage.js` (visualViewport useEffect, inputFocused state)

### 3. Video MM Download (iOS PWA)
- **Status**: CONFIRMED WORKING

### 4. Text MM PDF Download (iOS PWA)
- **Status**: CONFIRMED WORKING

### 5. ECT Beneficiary Avatars
- **Status**: CONFIRMED WORKING

### 6. CCP Plan PDF Download
- **Status**: CONFIRMED WORKING

### 7. MM Download Progress Indicators
- **Status**: IMPLEMENTED (April 2, 2026)

### 8. ECT Channel List Refresh on Back-out
- **Status**: IMPLEMENTED (April 2, 2026)
- **What**: `handleBackOut` calls `fetchChannels()` to refresh the channel list

---

## Blocked Items
- **Apple IAP**: Waiting on Paid Applications Agreement approval
- **Twilio SMS OTP**: Waiting on A2P 10DLC campaign approval

## P0/P1/P2 Prioritized Backlog

### P0
- ECT iOS Keyboard Fix — RE-IMPLEMENTED with height-only approach, awaiting user verification
- SDV Download Fix — RE-IMPLEMENTED with MongoDB tokens, awaiting user verification

### P1
- ECT Channel List — Code is correct. If still empty on production, need browser console logs
- **Google Play Store Launch**: User/CoS operational steps
- **Share Extension Setup**: Wire up iOS Extension per `/app/memory/SHARE_EXTENSION_SETUP.md`
- **iOS Live Updates**: Test Capgo OTA update flow

### P2
- **Readiness Scoring Policy Page**: Informational page explaining readiness score calculation
- **Scalability Enhancements**: Horizontal scaling, background workers, CDN

### P3
- **ECT Security Comparison Landing Page**: Public page at `/security`

## Critical Notes
- **Voice Biometrics**: Completely removed. Do not reintroduce.
- **Downloads**: ALL file downloads MUST go through `platformDownload()`.
- **Railway Build**: `requirements.txt` MUST have `--extra-index-url` as first line.
- **ECT Avatars**: Always use `resolve_photo_url()` for any `photo_url` from MongoDB.
