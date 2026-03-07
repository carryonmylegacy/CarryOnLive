# CarryOn — Product Requirements Document

## Original Problem Statement
CarryOn is a secure, AI-powered estate planning platform for American families. It helps users organize critical end-of-life documents, milestone messages, and digital asset credentials, encrypted and stored securely for beneficiaries to access when the time comes.

## Core Architecture
- **Frontend**: React 19 (CRA via Craco) + Tailwind CSS + Shadcn/UI — 32 pages, 74 components, 65 packages
- **Backend**: FastAPI (Python 3.11) — 170 endpoints, 26 route modules, 7 services, modular architecture
- **Database**: MongoDB Atlas (production) / local MongoDB (preview) — 35 collections
- **Storage**: AWS S3 (carryon-vault, us-east-2)
- **AI**: xAI Grok-4 (Estate Guardian AI)
- **Payments**: Stripe (checkout, subscriptions, proration)
- **Email**: Resend (OTP, notifications, digests)
- **Hosting**: Vercel (frontend) + Railway (backend)
- **Mobile**: Capacitor 6 → Codemagic → TestFlight
- **CI/CD**: GitHub Actions (lint + build)

## Subscription & Access Model
- **Free download** from App Store
- **30-day free trial** on signup — full access to all features
- **After trial expires (no subscription)**:
  - **Benefactor**: Read-only. Can view existing documents, messages, checklist. CANNOT upload new documents, create new messages, or add checklist items.
  - **Beneficiary**: Can view Living Will/Healthcare Directive and Power of Attorney regardless of subscription. CANNOT upload death certificate to trigger transition until benefactor's estate has active subscription.
- **Active subscription**: Full access restored
- **B2B/Enterprise codes**: Override subscription requirement (free_access flag)
- **Enforcement**: `guards.py` — `require_active_subscription` dependency checks trial, subscription, beta mode, and overrides. Applied to POST endpoints for documents, messages, checklist, and death certificate upload.

## Test Credentials
- **Admin**: info@carryon.us / Demo1234!
- **Benefactor Test**: fulltest@test.com / Password.123
- **Benefactor Demo**: demo@carryon.us / Demo1234!

## Pending / Backlog

### P0 (Critical)
- iOS Safe Area Double Padding — recurring issue where content is pushed too far down on initial iOS native load. Multiple fix attempts with JS-based toggling of `system-safe-area` class have been unreliable.

### P1 (High)
- Apple Passkeys ("Sign in with Passkey") via `@argo-navis-dev/capacitor-passkey-plugin`
- Share Extension — full native iOS Share Extension target in Xcode
- Operations Admin Page for Chief of Staff
- VAPID keys on Railway for push notifications
- Codemagic build for native Face ID testing

### P2 (Medium)
- SMS OTP via Twilio (awaiting A2P 10DLC approval)
- Animated logo (awaiting asset)
- ISO 27001 full compliance
- Beneficiary Hub & Gentle Intro Verification
- Will Creation Wizard — TurboTax-style guided will creation
- OCR Document Scanning — Camera-to-vault with text extraction

### P3 (Low)
- Redis-backed rate limiting
