# CarryOn — Product Requirements Document

## Original Problem Statement
CarryOn is a secure, AI-powered estate planning platform for American families.

## Transition Architecture (COMPLETE — Feb 2026)

### Pre-Transition (benefactor alive):
- Beneficiary can ONLY view: POA + Healthcare Directive/Living Will via PreTransitionPage
- ALL other sections gated by TransitionGate component (vault, messages, checklist, guardian, digital_wallet, timeline)
- Direct URL access to /beneficiary/vault etc. redirected to /beneficiary/pre
- Beneficiary CAN upload death certificate to initiate TVT

### TVT Approval (admin action):
- Death certificate approved → estate status = "transitioned"
- Benefactor user → account_locked = true (permanent, enforced by require_account_not_locked guard)
- Immediate-delivery messages released
- 30-day grace periods created

### Post-Transition (benefactor deceased):
- Beneficiaries get READ-ONLY access based on per-beneficiary section permissions
- EGA queries allowed
- Primary beneficiary inherits permission management via BeneficiaryDashboardPage panel
- Benefactor account immutable forever

### Section Permissions:
- 6 gatable sections: vault, messages, checklist, guardian, digital_wallet, timeline
- Benefactor sets via toggles on BeneficiariesPage (pre-transition)
- Primary beneficiary manages via BeneficiaryDashboardPage panel (post-transition)
- Backend: /api/estate/{id}/section-permissions (GET/PUT), /api/beneficiary/my-permissions/{id} (GET)
- Frontend: TransitionGate wraps routes, Switch toggles per beneficiary per section

## Test Credentials
- Admin: info@carryon.us / Demo1234!
- Benefactor: fulltest@test.com / Password.123

## Pending / Backlog

### P1 (High)
- Operations Admin Page for Chief of Staff
- VAPID keys on Railway for push notifications
- Re-apply deferred frontend features (network banner, force update, error reporter, pull-to-refresh, haptics)

### P2 (Medium)
- SMS OTP via Twilio, Will Creation Wizard, OCR Document Scanning
- PostHog re-integration via CDN (removed due to Safari crash)
