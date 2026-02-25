# CarryOn™ - Estate Planning & Legacy Management Platform

## Original Problem Statement
Build a secure estate planning and legacy management platform where benefactors prepare their estate (documents, messages, beneficiaries) and beneficiaries gain access after estate transition via death certificate upload and admin approval.

## What's Been Implemented

### Phase 1 - MVP (Complete)
- Authentication with email/password + OTP 2FA
- Benefactor Dashboard with readiness gauge
- Document Vault with categorized uploads and lock overlays
- Milestone Messages (text/video with triggers)
- Beneficiary Manager
- Estate Guardian AI Chat (OpenAI GPT-5.2)
- Immediate Action Checklist
- Trustee Services plans
- Estate Transition with death certificate upload
- Admin review workflow
- Beneficiary Portal (post-transition)
- Dark/Light theme toggle
- Mobile-responsive design

### Phase 2 - Security & Media (Complete)
- Document unlock with password/backup code verification
- AES-256 file encryption for all uploaded documents
- Backup code generation for locked documents
- Video message storage and retrieval
- Video playback in beneficiary messages view
- Resend email integration for OTP delivery

### Phase 3 - P1 Features (Complete)
- Document preview for PDFs and images before download
- Voice verification with Web Speech API
- Voice passphrase setup and verification

### Phase 4 - P2 Features (Complete)
- Multi-estate support (create/switch between estates)
- Estate selector dropdown in dashboard
- Activity timeline tracking all actions
- Activity logging for documents, messages, beneficiaries

## Test Accounts
- Benefactor: pete@mitchell.com / password123
- Beneficiary: penny@mitchell.com / password123
- Admin: admin@carryon.com / admin123

## Remaining Backlog

### P2
- Notification center (in-app alerts)
- Push notifications (PWA)

### P3
- Payment gateway for Trustee Services (Stripe)
- Digital asset management
- Family mediation scheduling
- Annual estate review reminders
- PWA offline support
