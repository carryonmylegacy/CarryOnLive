# CarryOn™ - Estate Planning & Legacy Management Platform

## Original Problem Statement
Build a secure estate planning and legacy management platform where benefactors prepare their estate (documents, messages, beneficiaries) and beneficiaries gain access after estate transition via death certificate upload and admin approval.

## What's Been Implemented

### Phases 1-5: Core MVP + Design (Complete)
- Auth with OTP 2FA, Document Vault (AES-256), Milestone Messages, Beneficiary Manager
- Estate Guardian AI (50-state law), Checklist, Estate Transition, Admin review
- Multi-estate, Activity timeline, Notifications, Dark/Light theme, Mobile/PWA

### Phase 6: Estate Readiness Score Algorithm (Complete)
- Documents, Messages, Checklist scoring with auto-recalculation

### Phase 7: Smart Estate Guardian AI (Complete)
- Vault analysis, checklist auto-population, readiness analysis, legal disclaimer

### Phase 8: Dashboard + UI Refinements (Complete)
- Checklist preview card, color-coded previews, darker vault blue
- Sidebar nav buttons with solid borders, synchronized hover effects
- Dark navy background, light blue light-mode, sidebar theme adaptation

### Phase 9: HTML Prototype Alignment (In Progress - Feb 2025)
- **Burger menu fixed:** Removed double X close button, added 7/8ths width divider lines between items
- **Renamed:** "Trustee Services" → "Designated Trustee Services" in all nav
- **Settings pricing:** Added 6 subscription tiers from prototype (Premium $8.99, Standard $7.99, Base $6.99, New Adult $3.99, Military/FR $5.99, Hospice Free) with billing toggle
- **Estate Guardian disclaimer:** Added UPL legal disclaimer from prototype

## Remaining from Phase 9 (P0)
- **Two-Level Section Security:** Password + voice + backup question locking for Vault, Messages, DTS, Beneficiaries, Checklist (from LOCKABLE in prototype)
- **DTS Workflow:** Full Designated Trustee Services page rebuild with request creation, quoting, line item approval, credential vault, task lifecycle
- **Section Disclaimers:** Pull remaining disclaimers/instructions from HTML into Vault, Checklist, Messages, Beneficiaries pages

## Test Accounts
- Benefactor: pete@mitchell.com / password123
- OTP: `tail -n 5 /var/log/supervisor/backend.err.log | grep -oP 'OTP for.*: \\K\\d+' | tail -1`

## Mocked Features
- Voice Verification: Always returns success
- Death Certificate Verification: Stub
- Designated Trustee Services: Needs full rebuild from prototype
