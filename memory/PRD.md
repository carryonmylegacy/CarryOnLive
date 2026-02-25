# CarryOn™ - Estate Planning & Legacy Management Platform

## Original Problem Statement
Build a secure estate planning and legacy management platform where benefactors prepare their estate (documents, messages, beneficiaries) and beneficiaries gain access after estate transition via death certificate upload and admin approval.

## User Personas
1. **Benefactor (Estate Owner)**: Primary user preparing estate (Pete Mitchell)
2. **Beneficiary**: Family member receiving estate access post-transition (Penny Mitchell)
3. **Admin**: Reviews and approves death certificates for transition

## Core Requirements
- ✅ Authentication with email/password + OTP 2FA
- ✅ Benefactor Dashboard with readiness gauge
- ✅ Document Vault with categorized uploads and lock overlays
- ✅ Milestone Messages (text/video with triggers)
- ✅ Beneficiary Manager
- ✅ Estate Guardian AI Chat (OpenAI GPT-5.2)
- ✅ Immediate Action Checklist
- ✅ Trustee Services plans
- ✅ Estate Transition with death certificate upload
- ✅ Admin review workflow
- ✅ Beneficiary Portal (post-transition)
- ✅ Dark/Light theme toggle
- ✅ Mobile-responsive design

## Architecture
- **Frontend**: React + Tailwind CSS + shadcn/ui
- **Backend**: FastAPI + MongoDB
- **AI Integration**: OpenAI GPT-5.2 via Emergent LLM Key
- **Auth**: JWT + OTP 2FA

## What's Been Implemented (2026-02-25)
### Backend
- User authentication (login + OTP verification)
- JWT token management
- Estate CRUD operations
- Document upload/management
- Milestone Messages with triggers
- Beneficiary management
- Checklist with toggle completion
- Death certificate upload
- Admin approval workflow
- Estate Guardian AI chat

### Frontend
- Login page with OTP modal
- Benefactor Dashboard (readiness gauge, stats, quick actions)
- Document Vault (categories, lock overlays)
- Milestone Messages page (create text/video messages)
- Beneficiaries page
- Estate Guardian AI chat interface
- Action Checklist page
- Trustee Services page
- Estate Transition page
- Settings page (theme toggle)
- Beneficiary Hub page
- Beneficiary Vault/Messages/Milestone pages
- Admin Dashboard
- Responsive sidebar & mobile navigation

## Test Accounts
- Benefactor: pete@mitchell.com / password123
- Beneficiary: penny@mitchell.com / password123
- Admin: admin@carryon.com / admin123

## Prioritized Backlog

### P0 (Critical)
- ✅ Complete authentication flow
- ✅ All core features functional

### P1 (High Priority)
- Document download functionality
- Video recording and playback
- Document lock/unlock verification
- Password/voice/backup unlock implementation

### P2 (Medium Priority)
- Email notifications for OTP
- Real file encryption (AES-256)
- Multi-estate support for benefactors
- Estate timeline/activity log
- Notification center

### P3 (Future)
- Payment gateway integration for Trustee Services
- Digital asset management (crypto, social accounts)
- Family mediation scheduling
- Annual estate review reminders
- PWA offline support

## Next Tasks
1. Implement document unlock functionality
2. Add video playback for recorded messages
3. Build notification system for transitions
4. Add email delivery for OTP codes
5. Implement file encryption at rest
