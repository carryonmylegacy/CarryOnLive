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

### Phase 5 - Design System Update (Feb 2025) - COMPLETE
- **Full UI Redesign to Match HTML Prototype:**
  - Updated color palette:
    - Background: #08090F (primary), #0D1018 (secondary), #12151F (tertiary)
    - Gold accent: #E0AD2B (primary), #F0C95C (secondary)
    - Text hierarchy: #F1F3F8, #D8DEE9, #A0AABF, #7B879E, #525C72
    - Blue accent: #3B7BF7
    - Green accent: #22C993
    - Purple accent: #8B5CF6
  - **Sidebar Redesign:**
    - Gradient background
    - Two navigation sections: "MY LEGACY" and "ACCOUNT"
    - Gold highlighting for active nav items with left border indicator
    - User avatar and info in footer
    - Dark/Light mode toggle
  - **Dashboard Redesign:**
    - Bento grid layout
    - Circular readiness gauge with score
    - Quick action cards (Upload Document, Create Message, Add Beneficiary, Ask Guardian)
    - Checklist preview with progress bar
    - Activity timeline
    - Security badge footer
  - **Component Updates:**
    - Glass-morphic cards with backdrop blur
    - Updated button styles (primary blue, gold accent, secondary)
    - Input fields with proper styling
    - Progress bars with gold gradient
  - **Official Logo Integration:**
    - App icon (favicon): carryon-icon.jpg
    - Platform screens logo: carryon-logo.jpg

## Test Accounts
- Benefactor: pete@mitchell.com / password123
- Beneficiary: penny@mitchell.com / password123
- Admin: admin@carryon.com / admin123
- OTP: Check backend logs `tail -1 /var/log/supervisor/backend.err.log | grep -oP 'OTP for.*: \K\d+'`

## Architecture
```
/app/
├── backend/
│   ├── server.py (FastAPI with all routes and models)
│   ├── requirements.txt
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
└── design_guidelines.json (Design system reference)
```

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

## Mocked Features
- **Voice Verification**: Always returns success
- **Death Certificate Verification**: Stub implementation (admin approval always works)
- **Trustee Services**: UI only, no actual payment integration
