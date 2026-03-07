# CarryOn — Product Requirements Document

## Original Problem Statement
CarryOn is a secure, AI-powered estate planning platform for American families. It helps users organize critical end-of-life documents, milestone messages, and digital asset credentials, encrypted and stored securely for beneficiaries to access when the time comes.

## Core Architecture
- **Frontend**: React 19 (CRA via Craco) + Tailwind CSS + Shadcn/UI — 32 pages, 75 components, 65 packages
- **Backend**: FastAPI (Python 3.11) — 176 endpoints, 27 route modules, 7 services, modular architecture
- **Database**: MongoDB Atlas (production) / local MongoDB (preview) — 39 collections
- **Storage**: AWS S3 (carryon-vault, us-east-2)
- **AI**: xAI Grok-4 (Estate Guardian AI)
- **Payments**: Stripe + Apple IAP (StoreKit 2)
- **Auth**: JWT + OTP (email) + WebAuthn Passkeys (Face ID / Touch ID)
- **Email**: Resend (OTP, notifications, digests)
- **Hosting**: Vercel (frontend) + Railway (backend)
- **Mobile**: Capacitor 6 → Codemagic → TestFlight
- **CI/CD**: GitHub Actions (lint + build)

## Authentication Methods
1. **Email + Password + OTP** (default)
2. **Face ID / Touch ID** via NativeBiometric (native Capacitor)
3. **Passkeys (WebAuthn)** — passwordless login via FIDO2
   - Registration: Settings → Security → Passkey toggle → Face ID prompt → credential stored
   - Login: "Sign in with Passkey" button on login page (visible after registration)
   - Backend: 4 endpoints in `webauthn.py` (register-options, register, login-options, login)
   - Frontend: `passkey.js` service wraps navigator.credentials API

## Apple Subscription Lifecycle
- **Client-side IAP**: `@capgo/native-purchases` (StoreKit 2)
- **Receipt Validation**: Server-side via Apple verifyReceipt + replay protection
- **Server Notifications v2**: `/api/webhook/apple` — JWS-signed lifecycle events
- **Grace Period**: `past_due` status treated as active access

## iOS Share Extension
- **Source files**: `ios/App/ShareExtension/` (ShareViewController.swift, Info.plist, entitlements)
- **App Group**: `group.us.carryon.app` — shared between main app and extension
- **Accepted types**: PDFs, JPEG, PNG, HEIC images (up to 5 files)
- **Flow**: Share sheet → extension saves to app group → main app picks up via @capgo/capacitor-share-target
- **Setup required in Xcode**: Add ShareExtension target pointing to existing source files

## Test Credentials
- **Admin**: info@carryon.us / Demo1234!
- **Benefactor Test**: fulltest@test.com / Password.123
- **Benefactor Demo**: demo@carryon.us / Demo1234!

## App Store Compliance Status (Feb 2026) — ALL CLEAR
- Privacy Manifest complete
- Subscription disclosure compliant (Guideline 3.1.2)
- Apple IAP receipt validation + Server Notifications v2
- LaunchScreen dark background, account deletion, push entitlement
- Encryption export compliance declared

## Pending / Backlog

### P1 (High)
- Operations Admin Page for Chief of Staff
- VAPID keys on Railway for push notifications

### P2 (Medium)
- SMS OTP via Twilio (awaiting A2P 10DLC)
- Will Creation Wizard
- OCR Document Scanning

### P3 (Low)
- Redis-backed rate limiting
- Animated logo (awaiting asset)
