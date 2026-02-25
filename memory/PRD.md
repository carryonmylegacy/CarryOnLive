# CarryOn™ - Estate Planning & Legacy Management Platform

## Original Problem Statement
Build a secure estate planning and legacy management platform where benefactors prepare their estate (documents, messages, beneficiaries) and beneficiaries gain access after estate transition via death certificate upload and admin approval.

## What's Been Implemented

### Benefactor Side (Complete)
- Auth with OTP 2FA, Document Vault (AES-256), Milestone Messages, Beneficiary Manager
- Estate Guardian AI (50-state law, vault analysis, checklist generation, readiness analysis)
- Immediate Action Checklist, Designated Trustee Services (full workflow), Estate Transition
- Multi-estate, Activity timeline, Notifications, Dark/Light theme, Mobile/PWA
- Estate Readiness Score algorithm, Settings with 6 pricing tiers
- All section landing pages matched to HTML prototype

### Beneficiary Side (Complete - Feb 2025)
10 pages matching HTML prototype:
1. **Estate Hub** — Multi-estate network view, "Welcome back" greeting, estate cards
2. **Pre-Transition** — Limited access, emergency docs (Medical Directive, POA), Upload Certificate + Contact Team
3. **Upload Certificate** — Full-screen 3-step wizard (Before You Begin → Upload → Confirm & Submit)
4. **Condolence Splash** — Animated 5-phase verification (Verifying → Authenticated → Sealing → Granting → Complete)
5. **Post-Transition Dashboard** — "We're here for you", sealed banner, 3 stat cards, preview cards
6. **Sealed Vault** — Read-only document vault with search, category filters, sealed banner
7. **Checklist** — Checkable items (beneficiary can mark done), priority borders, sealed notice
8. **Messages** — Delivered milestone messages, detail view, milestone reporting CTA, non-disclosure notice
9. **Estate Guardian** — Read-only AI, sealed vault analysis, no checklist push
10. **Report Milestone** — 13 milestone types, date, description, message delivery check, privacy disclaimer

### Admin Side (Complete)
- Full user database with search + role filter (34 users)
- Platform stats (Users, Benefactors, Beneficiaries, Estates, Pending Certs)
- Transition certificate review and approval
- User deletion capability
- Backend: GET /api/admin/users, GET /api/admin/stats, DELETE /api/admin/users/{id}

## Test Accounts
- Benefactor: pete@mitchell.com / password123
- Beneficiary: penny@mitchell.com / password123
- Admin: admin@carryon.com / admin123
- OTP: `tail -n 5 /var/log/supervisor/backend.err.log | grep -oP 'OTP for.*: \K\d+' | tail -1`

## Beneficiary Routes
- /beneficiary — Estate Hub
- /beneficiary/pre — Pre-Transition View
- /beneficiary/upload-certificate — Death Certificate Upload (full-screen)
- /beneficiary/condolence — Condolence + Verification (full-screen)
- /beneficiary/dashboard — Post-Transition Dashboard
- /beneficiary/vault — Sealed Document Vault
- /beneficiary/checklist — Checkable Action Checklist
- /beneficiary/messages — Delivered Messages
- /beneficiary/guardian — Estate Guardian AI (read-only)
- /beneficiary/milestone — Report Life Milestone

## Remaining Work (P1)
- Two-Level Section Security (password + voice + backup question)
- Beneficiary Settings page (subscription info from prototype)
- Voice/video message playback
- Estate switcher in beneficiary sidebar for multi-estate users
- Mobile/PWA refinements

## Mocked Features
- Voice Verification: Always returns success
- Death Certificate Verification: Stub (admin approval)
- DTS: Frontend only, no real backend task processing
