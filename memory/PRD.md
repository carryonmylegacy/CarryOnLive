# CarryOn — Product Requirements Document

## Original Problem Statement
CarryOn is a secure, AI-powered estate planning platform for American families. It helps users organize critical end-of-life documents, milestone messages, and digital asset credentials, encrypted and stored securely for beneficiaries to access when the time comes.

## Core Architecture
- **Frontend**: React 19 (CRA via Craco) + Tailwind CSS + Shadcn/UI — 32 pages, 82 components, 66 packages
- **Backend**: FastAPI (Python 3.11) — 209 endpoints, 28 route modules, 7 services
- **Database**: MongoDB Atlas (production) / local MongoDB (preview) — 41 collections
- **Storage**: AWS S3 (carryon-vault, us-east-2)
- **AI**: xAI Grok-4 (Estate Guardian AI)
- **Payments**: Stripe + Apple IAP (StoreKit 2) + Apple Server Notifications v2
- **Auth**: JWT + OTP + WebAuthn Passkeys + Native Biometric (Face ID)
- **Email**: Resend (OTP, notifications, digests)
- **Hosting**: Vercel (frontend) + Railway (backend)
- **Mobile**: Capacitor 6 → Codemagic → TestFlight
- **CI/CD**: GitHub Actions (lint + build)

## Pre-App Store Features (Implemented Feb 2026)
1. **Error Tracking** — `/api/errors/report` endpoint captures frontend crashes (message, stack, component, device info). No auth required for pre-login crashes.
2. **Network Status Banner** — Offline/reconnecting indicator with red/green states.
3. **Accessibility (VoiceOver)** — ARIA labels on all navigation elements (sidebar, bottom nav, menu drawer).
4. **Force Update Gate** — Minimum version check on native launch. Blocks with "Update Required" screen if below `min_version`.
5. **Haptic Feedback** — `@capacitor/haptics` for light/medium/success/warning/error taps on native.
6. **Pull-to-Refresh** — Dashboard, Vault, Messages pages. Touch-based with 80px threshold + haptic tap.
7. **Structured Logging** — `RequestTraceMiddleware` adds `X-Request-Id` to all responses and logs `req=ID method=X path=Y status=Z ms=N`.

## Test Credentials
- **Admin**: info@carryon.us / Demo1234!
- **Benefactor Test**: fulltest@test.com / Password.123
- **Benefactor Demo**: demo@carryon.us / Demo1234!

## App Store Status — ALL CLEAR
All compliance and quality checks passed across 4 test iterations (60-63).

## Pending / Backlog

### P1 (High)
- Operations Admin Page for Chief of Staff
- VAPID keys on Railway for push notifications

### P2 (Medium)
- SMS OTP via Twilio (awaiting A2P 10DLC)
- Will Creation Wizard
- OCR Document Scanning
- App Rating Prompt (StoreKit review)

### P3 (Low)
- Redis-backed rate limiting
- Animated logo (awaiting asset)
