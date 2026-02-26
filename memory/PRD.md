# CarryOn™ - Estate Planning & Legacy Management Platform

## What's Been Implemented (Complete)

### Benefactor Side
- Auth with OTP 2FA, Document Vault (AES-256), Milestone Messages, Beneficiary Manager
- Estate Guardian AI (50-state law, vault analysis, checklist generation, readiness analysis)
- Immediate Action Checklist, Designated Trustee Services (REAL backend), Estate Transition
- Multi-estate, Activity timeline, Notifications, Dark/Light theme, Mobile/PWA
- Estate Readiness Score, Settings with 6 pricing tiers
- Two-Level Section Security (Password + Voice with Whisper API + Backup) on 5 sections
- **Milestone Messages**: Edit existing messages + specific date trigger option

### Beneficiary Management (Enhanced Feb 2026)
- **Enhanced Demographics**: First/Middle/Last Name, Suffix, Relationship, Gender, DOB
- **Contact Info**: Email, Phone
- **Address Fields**: Street, City, State (US dropdown), ZIP
- **Additional Info**: SSN (last 4 digits), Notes/Special Instructions
- **Invitation Flow**: 
  - Benefactors can send email invitations to beneficiaries
  - Invitation status tracking: pending → sent → accepted
  - Resend capability for pending invitations
  - AcceptInvitationPage allows beneficiaries to create accounts from invitation links
  - Auto-links beneficiary record to new user account

### Beneficiary Side (11 pages)
- Estate Hub with **generational orbit visualization** (family members organized by generation: spouse/children → parents/siblings → grandparents → great-grandparents)
- Pre-Transition, Upload Certificate (3-step wizard), Condolence Splash (5-phase)
- Post-Transition Dashboard, Sealed Vault, Checkable Checklist
- Messages (text/voice/video playback), Estate Guardian (read-only)
- Report Milestone, Settings, Estate Switcher in sidebar

### Admin / Internal Team Portals (3 tabs)
- **All Users**: Full database, search + role filter, delete users
- **Transition Verification Team**: Review death certificates, approve (seals benefactor + grants beneficiary access) or reject, view uploaded documents
- **DTS Management Team**: View requests, submit itemized quotes, update status lifecycle

### Backend Infrastructure
- DTS: Full CRUD (create tasks, list, submit quotes, approve items, update status)
- Transition: Enhanced verification (enriched certificates, reject, view document)
- Voice: Real OpenAI Whisper integration for passphrase transcription + verification
- Beneficiary Invitation: Create, send, accept endpoints
- All endpoints tested and passing (iteration_12: 100% backend, 100% frontend)

## Test Accounts
- **Benefactor**: barnetharris@mac.com / 9170873 (NEW - Real user)
- **Benefactor**: pete@mitchell.com / password123 (Test)
- **Beneficiary**: sarah.harris@test.com / sarah123 (Created via invitation)
- **Beneficiary**: penny@mitchell.com / password123 (Test)
- **Admin**: admin@carryon.com / admin123
- **Pending Invitation**: Kent Harris - pieva2021@gmail.com (token: 4ab000de-129d-4230-8b85-bec04d4b011e)
- OTP: Auto-filled in dev mode, also in logs: `tail -n 5 /var/log/supervisor/backend.err.log`

## Key API Endpoints

### Beneficiary Management
- `POST /api/beneficiaries` - Create with enhanced demographics
- `DELETE /api/beneficiaries/{id}` - Remove beneficiary
- `POST /api/beneficiaries/{id}/invite` - Send invitation email
- `GET /api/invitations/{token}` - Get invitation details (public)
- `POST /api/invitations/accept` - Accept invitation & create account (public)

## Upcoming Tasks (P1)
1. **Push Notifications** - PWA features for important event alerts
2. **Multi-estate Support for Benefactors** - Manage multiple estates from one account

## Future/Backlog Tasks (P2)
1. **Payment Gateway** - Stripe integration for subscriptions & DTS payments
2. **Digital Asset Management** - Cryptocurrency wallets & social media accounts
3. **PDF Export** - Export estate plan summaries

## Known Issues (Low Priority)
1. **Resend Domain Mismatch** - Email API key needs production domain config
2. **Frontend Lint Warnings** - react-hooks/exhaustive-deps warnings in some components
