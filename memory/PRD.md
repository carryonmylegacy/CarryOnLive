# CarryOn™ - Estate Planning & Legacy Management Platform

## Original Problem Statement
Build a secure estate planning and legacy management platform where benefactors prepare their estate (documents, messages, beneficiaries) and beneficiaries gain access after estate transition via death certificate upload and admin approval.

## What's Been Implemented

### Phase 1 - MVP (Complete)
- Authentication with email/password + OTP 2FA
- **Enhanced Signup Form (Feb 2025):**
  - Separate First Name, Middle Name (optional), Last Name fields
  - Suffix dropdown (Jr., Sr., II, III, IV, V, Esq., MD, PhD)
  - Gender dropdown (Male, Female, Other, Prefer not to say)
  - Legal disclaimer for name accuracy
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
- Notification center with unread count badge

### Phase 5 - Design System Update (Feb 2025)
- Updated color palette to match original HTML prototype:
  - Background: #08090F (darker)
  - Gold accent: #E0AD2B
  - Text hierarchy: #F1F3F8, #A0AABF, #7B879E, #525C72
  - Blue links: #7AABFD
- Updated component styling:
  - Glass-card with 18px border-radius and backdrop-blur
  - Input fields with 11px border-radius
  - Gold gradient buttons
- Updated Login page with two-line tagline display
- Created design_guidelines.json for design system reference

## Test Accounts
- Benefactor: pete@mitchell.com / password123
- Beneficiary: penny@mitchell.com / password123
- Admin: admin@carryon.com / admin123

## Remaining Backlog

### P1 - Next Up
- Propagate design updates to Dashboard and other internal pages
- Voice Verification - Integrate real voice recognition API (currently MOCKED)
- Push Notifications - Implement PWA features

### P2
- Multi-estate Support for Benefactors - Create multiple estates

### P3
- Payment gateway for Trustee Services (Stripe)
- Digital asset management
- Family mediation scheduling
- Annual estate review reminders
- PWA offline support
