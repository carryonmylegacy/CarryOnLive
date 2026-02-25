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
- Auto-recalculation on all CRUD operations
- GET/POST /api/estate/{estate_id}/readiness endpoints

### Phase 7 - Smart Estate Guardian AI (Complete - Feb 2025)
- **50-State Estate Law Expertise:** Comprehensive system prompt covering community property vs common law, probate requirements, estate/inheritance taxes, trust law, POA variations, healthcare directives, homestead exemptions, digital assets, beneficiary designations
- **Document Vault Analysis:** AI reads and analyzes actual document contents (PDF text extraction via pdfplumber, text files). Identifies gaps, inconsistencies, missing provisions, and state-specific compliance issues
- **AI Checklist Auto-Population:** Generates prioritized, estate-specific checklist items from vault analysis. Items categorized by urgency (immediate, first_week, two_weeks, first_month). Deduplicates against existing items
- **Readiness Score Analysis:** AI explains readiness score with detailed breakdown, identifies missing documents/messages/items, provides state-specific actionable recommendations
- **Context Injection:** Every AI call includes full estate context (documents, beneficiaries, checklist status, readiness breakdown, messages)
- **Estate State Field:** Added state field to Estate model for state-specific law application
- **Frontend:** Three action buttons (Analyze Vault, Generate Checklist, Analyze Readiness), markdown rendering, action badges, readiness breakdown cards

## Test Accounts
- Benefactor: pete@mitchell.com / password123
- Beneficiary: penny@mitchell.com / password123
- Admin: admin@carryon.com / admin123
- OTP: `tail -n 5 /var/log/supervisor/backend.err.log | grep -oP 'OTP for.*: \K\d+' | tail -1`

## Architecture
```
/app/backend/server.py - FastAPI (all routes, models, AI logic)
/app/frontend/src/pages/GuardianPage.js - AI chat with action buttons
/app/frontend/src/pages/DashboardPage.js - Readiness gauge + breakdown
/app/frontend/src/pages/BeneficiariesPage.js - DOB/gender fields
```

## Key API Endpoints
- `POST /api/chat/guardian` - AI chat with action support (analyze_vault, generate_checklist, analyze_readiness)
- `GET/POST /api/estate/{estate_id}/readiness` - Readiness score breakdown
- `PATCH /api/estates/{estate_id}` - Update estate (including state field)

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
