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
- **Email**: Resend (requires domain verification for production)
- **Encryption**: AES-256 via Fernet (cryptography library)

## What's Been Implemented

### Phase 1 (2026-02-25) - MVP
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
- All portal pages (Benefactor, Beneficiary, Admin)

### Phase 2 (2026-02-25) - Security & Media Features
- ✅ Document unlock with password/backup code verification
- ✅ AES-256 file encryption for all uploaded documents
- ✅ Backup code generation for locked documents
- ✅ Video message storage and retrieval endpoints
- ✅ Video playback in beneficiary messages view
- ✅ Resend email integration for OTP delivery (requires domain verification)
- ✅ Improved OTP input UX

## Test Accounts
- Benefactor: pete@mitchell.com / password123
- Beneficiary: penny@mitchell.com / password123
- Admin: admin@carryon.com / admin123

## Prioritized Backlog

### P0 (Critical) - DONE
- ✅ Complete authentication flow
- ✅ All core features functional
- ✅ Document encryption
- ✅ Document unlock functionality

### P1 (High Priority)
- Verify custom domain for Resend email delivery
- Voice verification integration (currently uses backup code fallback)
- Document preview before download

### P2 (Medium Priority)
- Multi-estate support for benefactors
- Estate timeline/activity log
- Notification center
- Push notifications (PWA)

### P3 (Future)
- Payment gateway integration for Trustee Services
- Digital asset management (crypto, social accounts)
- Family mediation scheduling
- Annual estate review reminders
- PWA offline support

## Next Tasks
1. Verify domain in Resend for production email delivery
2. Add document preview functionality
3. Build notification system for transitions
4. Implement voice verification API integration
