# CarryOn Platform — Product Requirements Document

## Original Problem Statement
Build a comprehensive family preparedness platform (CarryOn) with features including:
- PWA Push Notifications (iOS + Android)
- Estate Communication Tool (ECT) — private chat system
- Connected Continuity Protocol (CCP) — emergency preparedness wizard
- Milestone Messages — scheduled video/text messages
- Vault — secure document storage
- Financial Portal — asset tracking
- Admin/Operator dashboard with multi-role support
- Stripe subscription billing + Apple IAP
- Capacitor-based iOS/Android native apps

## Architecture
- **Frontend**: React 18 + Tailwind CSS + Shadcn/UI + Capacitor
- **Backend**: FastAPI + MongoDB
- **Auth**: JWT with username/email login, OTP, WebAuthn
- **Integrations**: xAI Grok (AI Guardian), Resend (email), Stripe (payments), Google Places API, VAPID (push), Twilio SMS (blocked)

## Key Technical Decisions
- Pure CSS iOS keyboard handling (position: fixed + inset: 0)
- Chat input uses wrapper div for border (NOT border/outline on input — causes iOS caret bug)
- Safe additive refactoring only (0% risk policy for live site)
- Web Push on iOS requires PWA mode (Add to Home Screen)

## What's Been Implemented (Latest)
- **Apr 13, 2026**: Housekeeping audit (lint clean, pycache purge, no secrets/hardcoded URLs)
- **Apr 13, 2026**: iOS chat input cursor fix — wrapper div approach (border: none; outline: none on input)
- **Apr 12-13, 2026**: Estate Chat message ordering fix, CCP walkthrough tile flex, monolithic file refactoring (9 sub-components), Web Push iOS PWA fix, Settings duplicate toggle removal, Chat input styling overhaul

## Blocked Items
- Apple IAP: Awaiting Apple "Paid Applications Agreement" approval
- Twilio SMS: Awaiting A2P 10DLC campaign approval

## Upcoming Tasks (Prioritized)
1. 🔴 (P0) Google Play Store Launch — operational steps from user/CoS
2. 🟡 (P1) iOS Share Extension Setup — per /app/memory/SHARE_EXTENSION_SETUP.md
3. 🟡 (P1) Capgo Live Updates — over-the-air updates for Capacitor
4. 🟢 (P2) CFP Getting Started integration — financial step in onboarding wizard
5. 🟢 (P2) Readiness Scoring Policy Page
6. 🟢 (P3) ECT Security Comparison Landing Page

## Critical Dev Notes
- NEVER modify root element styling of EstateChatPage.js (position: fixed; inset: 0)
- Chat input: Use wrapper div for border, input stays naked (border: none; outline: none)
- All frontend API calls must use REACT_APP_BACKEND_URL + /api prefix
- iOS Push only works in installed PWA mode (PushManager check)
- Refactoring must be purely additive, zero-risk
