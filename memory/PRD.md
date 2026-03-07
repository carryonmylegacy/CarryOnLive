# CarryOn — Product Requirements Document

## Original Problem Statement
CarryOn is a secure, AI-powered estate planning platform for American families. It helps users organize critical end-of-life documents, milestone messages, and digital asset credentials, encrypted and stored securely for beneficiaries to access when the time comes.

## Core Architecture
- **Frontend**: React 19 (CRA via Craco) + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI (Python 3.11) — 215+ endpoints, 29 route modules
- **Database**: MongoDB Atlas (production) / local MongoDB (preview)
- **Auth**: JWT + OTP + WebAuthn Passkeys + Native Biometric (Face ID)
- **Payments**: Stripe + Apple IAP (StoreKit 2) + Apple Server Notifications v2
- **Mobile**: Capacitor 6 → Codemagic → TestFlight

## Transition Architecture (NEW — Feb 2026)

### Pre-Transition (benefactor alive):
- Beneficiary can ONLY view: POA + Healthcare Directive/Living Will
- All other sections (Vault, Messages, Checklist, Guardian, Digital Wallet) are GATED
- Beneficiary CAN upload death certificate to initiate TVT

### TVT Approval:
- Admin reviews and approves death certificate
- Estate status → "transitioned"
- Benefactor account → permanently locked (account_locked: true)
- Immediate-delivery messages released
- 30-day grace periods created for beneficiaries

### Post-Transition:
- Beneficiaries get READ-ONLY access based on per-beneficiary section permissions
- EGA (Estate Guardian AI) queries allowed
- Primary beneficiary inherits permission management for other beneficiaries
- Benefactor account immutable forever

### Section Permissions:
- Per-beneficiary, per-section toggles (vault, messages, checklist, guardian, digital_wallet, timeline)
- Benefactor sets these while alive
- Primary beneficiary manages them post-transition
- Backend: `/api/estate/{id}/section-permissions` (GET/PUT)
- Backend: `/api/beneficiary/my-permissions/{estate_id}` (GET)
- Frontend: `TransitionGate` component wraps all post-transition beneficiary routes

## Test Credentials
- **Admin**: info@carryon.us / Demo1234!
- **Benefactor Test**: fulltest@test.com / Password.123

## Pending / Backlog

### P0 (Critical - In Progress)
- Benefactor UI: Per-beneficiary section permission toggles on BeneficiariesPage
- Primary beneficiary: Permission management UI post-transition

### P1 (High)
- Operations Admin Page for Chief of Staff
- VAPID keys on Railway for push notifications
- Re-apply frontend features (network banner, force update, error reporting, pull-to-refresh) — requires careful yarn.lock management

### P2 (Medium)
- SMS OTP via Twilio (awaiting A2P 10DLC)
- Will Creation Wizard
- OCR Document Scanning
- PostHog analytics (currently removed due to Safari crash — re-add via CDN once fixed)
