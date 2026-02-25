# CarryOn™ - Estate Planning & Legacy Management Platform

## Original Problem Statement
Build a secure estate planning and legacy management platform where benefactors prepare their estate (documents, messages, beneficiaries) and beneficiaries gain access after estate transition via death certificate upload and admin approval.

## What's Been Implemented

### Phase 1 - MVP (Complete)
- Authentication with email/password + OTP 2FA
- Enhanced Signup Form (First/Middle/Last name, suffix, gender)
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
- AES-256 file encryption, backup codes, voice passphrase
- Video message storage and playback
- Resend email integration for OTP

### Phase 3-4 - Features (Complete)
- Document preview, voice verification (Web Speech API)
- Multi-estate support, activity timeline, notification center

### Phase 5 - Design System Update (Complete)
- Full UI redesign, dark/light theme, Swiss chronometer gauge, mobile/PWA layout

### Phase 6 - Estate Readiness Score Algorithm (Complete - Feb 2025)
- Documents Score: 5 required legal docs with fuzzy name matching
- Messages Score: Milestone-based per beneficiary (age/relation/gender)
- Checklist Score: 25+ items required, completion tracking
- Overall Score: Average of 3 categories

### Phase 7 - Smart Estate Guardian AI (Complete - Feb 2025)
- 50-state estate law expertise system prompt
- Document Vault analysis with PDF text extraction (pdfplumber)
- AI Checklist auto-population from vault analysis
- Readiness Score analysis with state-specific recommendations

### Phase 8 - Dashboard UI Refinements (Complete - Feb 2025)
- **Checklist Preview Card:** Added "most recent" summary card for Immediate Action Checklist alongside Vault and Messages previews (3-column grid)
- **Color-Coded Preview Cards:** Each preview card has a colored left border, matching icon, and matching link color: Vault=Blue (#2563eb), Messages=Purple (#8b5cf6), Checklist=Orange (#f97316)
- **Darker Vault Blue:** Updated Secure Document Vault blue from #3b82f6 to #2563eb across all associated elements (stat cards, readiness dots, preview cards, activity timeline, Guardian AI)
- **Sidebar Nav Enhancement:** Nav items enlarged to 15px font, 22px icons, 14px/18px padding, 12px border-radius, button-like styling with subtle borders and background

## Test Accounts
- Benefactor: pete@mitchell.com / password123
- Beneficiary: penny@mitchell.com / password123
- Admin: admin@carryon.com / admin123
- OTP: `tail -n 5 /var/log/supervisor/backend.err.log | grep -oP 'OTP for.*: \\K\\d+' | tail -1`

## Architecture
```
/app/backend/server.py - FastAPI (all routes, models, AI logic)
/app/frontend/src/pages/DashboardPage.js - Readiness gauge + preview cards
/app/frontend/src/pages/GuardianPage.js - AI chat with action buttons
/app/frontend/src/index.css - Design system, nav styles, card colors
/app/frontend/src/components/layout/Sidebar.js - Navigation
```

## Remaining Backlog

### P1
- Voice Verification - real voice recognition API (MOCKED)
- Push Notifications - PWA features
- Beneficiary email invitation flow

### P2
- PDF export, enhanced beneficiary onboarding

### P3
- Stripe for Trustee Services, digital asset management, PWA offline

### Refactoring
- Split server.py into routes/models/services
- Break down VaultPage.js

## Mocked Features
- Voice Verification: Always returns success
- Death Certificate Verification: Stub (admin approval always works)
- Trustee Services: UI only
