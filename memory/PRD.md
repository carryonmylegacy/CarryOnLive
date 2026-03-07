# CarryOn — Product Requirements Document

## Original Problem Statement
CarryOn is a secure, AI-powered estate planning platform for American families. It helps users organize critical end-of-life documents, milestone messages, and digital asset credentials, encrypted and stored securely for beneficiaries to access when the time comes.

## Core Architecture
- **Frontend**: React 19 (CRA via Craco) + Tailwind CSS + Shadcn/UI — 32 pages, 74 components, 65 packages
- **Backend**: FastAPI (Python 3.11) — 172 endpoints, 27 route modules, 7 services, modular architecture
- **Database**: MongoDB Atlas (production) / local MongoDB (preview) — 37 collections
- **Storage**: AWS S3 (carryon-vault, us-east-2)
- **AI**: xAI Grok-4 (Estate Guardian AI)
- **Payments**: Stripe (checkout, subscriptions, proration) + Apple IAP (native iOS)
- **Email**: Resend (OTP, notifications, digests)
- **Hosting**: Vercel (frontend) + Railway (backend)
- **Mobile**: Capacitor 6 → Codemagic → TestFlight
- **CI/CD**: GitHub Actions (lint + build)

## Apple Subscription Lifecycle (NEW — Feb 2026)
- **Client-side IAP**: `@capgo/native-purchases` handles StoreKit 2 purchase flow
- **Receipt Validation**: Server-side verification via Apple's `verifyReceipt` endpoint + transaction replay protection (`apple_transactions` collection)
- **Server Notifications v2**: Webhook at `/api/webhook/apple` receives JWS-signed lifecycle events
  - `SUBSCRIBED` → Activate subscription
  - `DID_RENEW` → Extend period
  - `DID_FAIL_TO_RENEW` → Mark `past_due` (grace period — user retains access)
  - `EXPIRED` / `GRACE_PERIOD_EXPIRED` → Revoke access
  - `REFUND` → Mark refunded, revoke access
  - `REVOKE` → Family Sharing revoked
  - `DID_CHANGE_RENEWAL_STATUS` → Update auto-renew flag
- **Audit Trail**: All webhook notifications logged to `apple_webhook_log`

## Subscription & Access Model
- **Free download** from App Store
- **30-day free trial** on signup — full access to all features
- **After trial expires (no subscription)**:
  - **Benefactor**: Read-only
  - **Beneficiary**: Can view Living Will/Healthcare Directive and POA only
- **Active subscription** or **past_due** (Apple grace period): Full access
- **B2B/Enterprise codes**: Override subscription requirement
- **Enforcement**: `guards.py` — `require_active_subscription` checks trial, subscription (active/past_due), beta mode, and overrides

## Test Credentials
- **Admin**: info@carryon.us / Demo1234!
- **Benefactor Test**: fulltest@test.com / Password.123
- **Benefactor Demo**: demo@carryon.us / Demo1234!

## App Store Audit Status (Feb 2026) — ALL CLEAR
- Privacy Manifest complete (DiskSpace, FileTimestamp, UserDefaults, analytics)
- Subscription disclosure compliant (auto-renewal, Privacy/Terms links)
- Apple IAP receipt validation with server-side verification
- Apple Server Notifications v2 webhook implemented
- LaunchScreen dark background matching app theme
- Account deletion GDPR-compliant
- Push notification entitlement configured
- Encryption export compliance declared

## Pending / Backlog

### P1 (High)
- Apple Passkeys ("Sign in with Passkey")
- Share Extension — native iOS target in Xcode
- Operations Admin Page for Chief of Staff
- VAPID keys on Railway for push notifications

### P2 (Medium)
- SMS OTP via Twilio (awaiting A2P 10DLC)
- Animated logo (awaiting asset)
- ISO 27001 full compliance
- Will Creation Wizard
- OCR Document Scanning

### P3 (Low)
- Redis-backed rate limiting
