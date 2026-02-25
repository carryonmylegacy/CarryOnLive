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

### Phase 5 - Design System Update (Complete)
- Full UI redesign to match HTML prototype
- Dark/Light mode with Swiss chronometer gauge
- Mobile/PWA responsive layout
- Custom needle design and color scheme

### Phase 6 - Estate Readiness Score Algorithm (Complete - Feb 2025)
- **Documents Score (0-100%):** Checks for 5 required legal documents: Last Will, Revocable Living Trust, Financial PoA, Medical PoA, Healthcare Directive/Living Will. Fuzzy name matching.
- **Messages Score (0-100%):** Calculates expected milestones per beneficiary based on age, relation, and gender. Milestones include education, marriage, career events, etc.
- **Checklist Score (0-100%):** Requires 25+ items. Score based on item count coverage (50%) and completion rate (50%). 30 default items auto-created for new estates.
- **Overall Score:** Average of the three category scores.
- **Beneficiary form:** Added date_of_birth and gender fields for milestone calculation.
- **Endpoints:** GET/POST `/api/estate/{estate_id}/readiness` for detailed breakdown.
- **Auto-recalculation:** Triggered on document upload, message creation, checklist toggle, and beneficiary add.

## Test Accounts
- Benefactor: pete@mitchell.com / password123
- Beneficiary: penny@mitchell.com / password123
- Admin: admin@carryon.com / admin123
- OTP: Check backend logs `tail -n 5 /var/log/supervisor/backend.err.log | grep -oP 'OTP for.*: \K\d+' | tail -1`

## Architecture
```
/app/
├── backend/
│   ├── server.py (FastAPI with all routes and models)
│   ├── requirements.txt
│   ├── tests/test_readiness_score.py
│   └── .env (MONGO_URL, DB_NAME, RESEND_API_KEY, OPENAI_API_KEY)
├── frontend/
│   ├── src/
│   │   ├── pages/ (Login, Signup, Dashboard, Vault, Messages, etc.)
│   │   ├── components/ (layout/Sidebar, layout/MobileNav, ui/*)
│   │   ├── contexts/ (AuthContext, ThemeContext)
│   │   ├── index.css (Design system with CSS variables)
│   │   └── App.js (Routing)
│   └── public/
│       ├── carryon-logo.jpg
│       └── carryon-icon.jpg
└── design_guidelines.json
```

## Key API Endpoints
- `GET /api/estate/{estate_id}/readiness` - Detailed readiness breakdown
- `POST /api/estate/{estate_id}/readiness` - Recalculate readiness
- `POST /api/beneficiaries` - Create beneficiary (now with date_of_birth, gender)
- `POST /api/documents/upload` - Upload document (triggers readiness recalc)
- `POST /api/messages` - Create message (triggers readiness recalc)
- `PATCH /api/checklists/{item_id}/toggle` - Toggle checklist (triggers readiness recalc)

## Remaining Backlog

### P1 - Next Up
- Voice Verification - Integrate real voice recognition API (currently MOCKED)
- Push Notifications - Implement PWA features
- Beneficiary email invitation flow

### P2
- PDF export for estate summary
- Enhanced beneficiary onboarding

### P3
- Payment gateway for Trustee Services (Stripe)
- Digital asset management (crypto wallets, social media)
- Family mediation scheduling
- Annual estate review reminders
- PWA offline support

### Refactoring
- Split monolithic server.py into routes/models/services
- Break down large frontend components (VaultPage.js)

## Mocked Features
- **Voice Verification**: Always returns success
- **Death Certificate Verification**: Stub implementation (admin approval always works)
- **Trustee Services**: UI only, no actual payment integration
