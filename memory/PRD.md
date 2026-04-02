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
- **Admin Routes**: Modular `routes/admin/` package (users, analytics, security_scan, estate_health, platform, grace_periods, dev_switcher, scoped_roles, ip_whitelist, bulk_ops, canned_responses, maintenance, task_management)
- **Guards**: `guards.py` exports `require_admin`, `require_staff`, `require_benefactor_role`, `require_admin_scope`, `get_current_user` for DRY access control

## CRITICAL: Beta Access Model
**There is NO global `beta_mode` toggle.** Beta access is controlled per-user via the `is_beta_tester` flag on individual benefactor and beneficiary accounts. Each user gets a beta tile at initial login as part of the onboarding workflow. The global `beta_mode` field in `subscription_settings` is legacy/deprecated — do NOT add new code that checks it. Always use the per-user `is_beta_tester` flag for beta-related logic.

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
- **subscription_settings**: _id="global", feature_gates (per-feature per-tier boolean map), feature_gates_published_at, feature_gates_published_by

---

## LOCKED-IN FEATURES — DO NOT REGRESS

### 1. Video MM Download (iOS PWA)
- **Status**: CONFIRMED WORKING
- **Files**: `downloadFile.js`, `downloads.py`, `messages.py`
- **DO NOT**: Use `window.location.href`, `window.open`, or `<a download>` for iOS downloads.

### 2. Text MM PDF Download (iOS PWA)
- **Status**: CONFIRMED WORKING
- **DO NOT**: Replace `fpdf2` or remove `_pdf_safe()` or return `pdf.output()` without `bytes()`.

### 3. ECT Beneficiary Avatars
- **Status**: CONFIRMED WORKING
- **DO NOT**: Return raw `photo_url` without calling `resolve_photo_url()`.

### 4. CCP Plan PDF Download
- **Status**: CONFIRMED WORKING

### 5. Railway Build
- **Status**: CONFIRMED WORKING
- `--extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/` as line 1 of `requirements.txt`

### 6. Universal Download Proxy Architecture
- **Status**: CONFIRMED WORKING

### 7. ECT iOS Keyboard / Visual Viewport Handling
- **Status**: RE-IMPLEMENTED (April 2, 2026)
- **What**: `window.visualViewport` API dynamically resizes `#ect-root` height to match the visible viewport when the iOS keyboard opens. Container stays at `top: 0` (NOT `offsetTop`).
- **Key behavior**: `vv.height` sets container height + `window.scrollTo(0, 0)` prevents iOS auto-scroll
- **Safe-area**: `env(safe-area-inset-bottom)` applied ONLY when keyboard is NOT visible
- **Input bar**: Solid background `#151D30` (not translucent)
- **scrollIntoView BANNED**: Replaced with direct `scrollTop` on messages container parent. `scrollIntoView` scrolls the entire window on iOS PWA.
- **Files**: `EstateChatPage.js` (visualViewport useEffect, inputFocused state, input bar styles)
- **DO NOT**: Use `vv.offsetTop` for positioning — pushes container behind keyboard blur zone
- **DO NOT**: Use `bottom: 0` on #ect-root — iOS doesn't resize fixed elements for keyboard
- **DO NOT**: Re-add `scrollIntoView()` anywhere — use `parentElement.scrollTop = scrollHeight` instead
- **DO NOT**: Re-add `backdrop-filter: blur()` or translucent `rgba()` background on input bar

### 8. iOS PWA Download Utility (`downloadFile.js`)
- **Status**: CONFIRMED WORKING

---

## Blocked Items
- **Apple IAP**: Waiting on Paid Applications Agreement approval
- **Twilio SMS OTP**: Waiting on A2P 10DLC campaign approval (resubmitted March 24, 2026)

## P0/P1/P2 Prioritized Backlog

### P0
- ECT iOS Keyboard Fix — RE-IMPLEMENTED, awaiting user verification

### P1
- **Google Play Store Launch**: User/CoS needs to execute operational steps
- **Share Extension Setup**: Wire up iOS Extension per `/app/memory/SHARE_EXTENSION_SETUP.md`
- **iOS Live Updates**: Test Capgo OTA update flow end-to-end

### P2
- **Readiness Scoring Policy Page**: Informational page explaining readiness score calculation
- **Scalability Enhancements**: Horizontal scaling, background workers, CDN

### P3
- **ECT Security Comparison Landing Page**: Public page at `/security` with visual comparison table

## Critical Notes
- **User Testing Protocol**: User NEVER tests on preview URL. Deploys via GitHub → Railway/Vercel → tests on iOS device.
- **Voice Biometrics**: Completely removed. Do not reintroduce.
- **Eyeball Icons**: Any new password inputs MUST include `onMouseDown={(e) => e.preventDefault()}`.
- **Downloads**: ALL file downloads MUST go through `platformDownload()`. ALL `fpdf2` output MUST be wrapped in `bytes()`.
- **SVG in JSX**: Use `dangerouslySetInnerHTML` for dynamic SVG content.
- **ECT Avatars**: Always use `resolve_photo_url()` for any `photo_url` from MongoDB.
- **Railway Build**: `requirements.txt` MUST have `--extra-index-url` as first line.
