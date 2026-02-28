# CarryOn™ - Product Requirements Document

## Original Problem Statement
CarryOn™ is an AI-powered estate planning platform that helps users ("benefactors") organize, secure, and pass on their legacy to designated beneficiaries. The platform includes secure document vaults, milestone messages, beneficiary management, an AI assistant (Estate Guardian), and more.

## Core Architecture
- **Frontend**: React (Vercel - app.carryon.us)
- **Backend**: FastAPI (Railway)
- **Database**: MongoDB Atlas
- **Payments**: Stripe (LIVE keys)
- **Mobile**: Capacitor/Codemagic (TestFlight)

## What's Been Implemented

### Authentication & User Management
- Email/password registration with OTP verification
- Login/logout with JWT tokens
- Role-based access (admin, benefactor, beneficiary)
- Date of birth collection on signup (for age-based tier eligibility)
- Dev-login restricted to admin accounts only

### Estate & Document Management
- Estate creation and management
- Secure Document Vault with AES-256 encryption
- Milestone Messages
- Beneficiary management with orbit visualization
- Immediate Action Checklist

### Subscription & Payment System
- 30-day free trial, 6 benefactor tiers, 4 beneficiary tiers, Family Plan
- Billing cycles: Monthly, Quarterly (10% off), Annual (20% off)
- Stripe checkout integration (LIVE keys)
- Subscription management: upgrade/downgrade, billing cycle switch, cancel
- Family Plan savings visualization

### Estate Guardian AI Chat (Feb 28, 2026)
- **Landing Page**: ChatGPT-like session hub with hero section, "Ask anything" input, quick action buttons, and last 20 recent conversations
- **Session Management**: Create new chats, resume previous conversations, delete sessions
- **Cross-Chat Knowledge**: AI has context from up to 5 recent sessions
- **Chat View**: Full-screen immersive chat with back arrow to return to landing

### Security (Audited Feb 28, 2026)
- SecurityHeadersMiddleware: X-Frame-Options DENY, HSTS, nosniff, XSS-Protection
- RateLimitMiddleware: 10 req/min on login, 20 req/min on registration
- CORS properly configured for production domains
- NoSQL injection protected via Pydantic validation
- XSS payloads handled safely
- No password leaks in any public endpoint
- Dev-switcher config secured (passwords removed from public response)
- All private endpoints require valid JWT token
- MongoDB _id properly excluded from all responses

### Admin Controls
- Beta mode toggle, per-user discount/free access, family plan toggle
- Verification management, analytics dashboard, trial reminder trigger
- Support chat system, activity log, subscription management

## Code Architecture (Updated Feb 28, 2026)

```
/app
├── backend/
│   ├── server.py                   # Main app with security middleware
│   ├── config.py                   # DB, env config
│   ├── utils.py                    # Auth helpers, OTP, encryption
│   ├── models.py                   # Pydantic models
│   ├── routes/
│   │   ├── auth.py                 # Login, register, OTP, dev-login
│   │   ├── admin.py                # SECURED: dev-switcher no longer leaks passwords
│   │   ├── admin_digest.py         # Weekly analytics digest
│   │   ├── guardian.py             # Chat sessions, cross-chat knowledge
│   │   ├── estates.py              # Estate CRUD
│   │   ├── documents.py            # Document management
│   │   ├── beneficiaries.py        # Beneficiary management
│   │   ├── messages.py             # Milestone messages
│   │   ├── checklist.py            # Action checklist
│   │   ├── subscriptions.py        # Stripe integration
│   │   ├── family_plan.py          # Family plan features
│   │   ├── digital_wallet.py       # Digital wallet vault
│   │   ├── dts.py                  # Digital trustee services
│   │   ├── support.py              # Support tickets
│   │   ├── transition.py           # Estate transition
│   │   ├── security.py             # Security questions
│   │   ├── push.py                 # Push notifications
│   │   ├── digest.py               # Weekly digest emails
│   │   ├── pdf_export.py           # Estate PDF export
│   │   └── trial_reminders.py      # Trial reminder scheduler
│   ├── services/
│   │   ├── readiness.py            # Readiness score calculation
│   │   └── voice_biometrics.py     # Voice biometric service
│   └── tests/                      # Pytest test suite
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── GuardianPage.js     # Landing + chat view with session management
│   │   │   ├── SettingsPage.js     # Refactored with extracted components
│   │   │   ├── AdminPage.js        # Admin dashboard (REFACTORED: 142-line shell)
│   │   │   ├── DashboardPage.js    # Main dashboard
│   │   │   ├── VaultPage.js        # Document vault
│   │   │   └── ...                 # Other pages
│   │   ├── components/
│   │   │   ├── settings/           # Extracted subscription components
│   │   │   │   ├── PlanCard.js
│   │   │   │   ├── BillingToggle.js
│   │   │   │   └── SubscriptionManagement.js
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.js
│   │   │   │   └── MobileNav.js    # FIXED: duplicate key warning
│   │   │   └── ...
│   │   └── contexts/
│   │       ├── AuthContext.js
│   │       └── ThemeContext.js
│   └── .env
├── codemagic.yaml                  # OPTIMIZED: Xcode build flags
└── memory/
    ├── PRD.md
    └── DEPLOY.md
```

## Security Audit Results (Feb 28, 2026)
| Test | Status |
|------|--------|
| Rate Limiting (10/min login) | PASS |
| Security Headers (HSTS, X-Frame, etc.) | PASS |
| NoSQL Injection Protection | PASS |
| Password Leak Prevention | PASS |
| XSS Protection | PASS |
| Auth Bypass Prevention | PASS |
| IDOR Prevention | PASS |
| Token Validation | PASS |
| Admin Endpoint Protection | PASS |

## House Cleaning (Feb 28, 2026)
- Removed orphaned components: `ActivityTimeline.js`, `NotificationCenter.js`
- Cleaned `__pycache__` directories
- Removed stale `test_result.md`
- Fixed React duplicate key warning in `MobileNav.js`
- Verified all `.env` keys are actively used (no stale secrets)
- Verified all MongoDB queries exclude `_id` from responses

## Test Accounts
- **User**: barnetharris@gmail.com / Blh9170873
- **Admin**: founder@carryon.us / CarryOntheWisdom!
- **Local Admin**: admin@carryon.com / admin123

## AdminPage.js Refactoring (Completed Feb 28, 2026)
- Reduced from 1588 lines → 142 lines (main shell)
- Extracted 9 tab components into `/frontend/src/components/admin/`:
  - UsersTab.js (109 lines), TransitionTab.js (156 lines), DTSTab.js (185 lines)
  - SupportTab.js (189 lines), SubscriptionsTab.js (253 lines), VerificationsTab.js (151 lines)
  - AnalyticsTab.js (249 lines), ActivityTab.js (80 lines), DevSwitcherTab.js (207 lines)
- All 9 tabs verified working with 100% pass rate

## AES-256-GCM Encryption Architecture (Implemented Feb 28, 2026)

### What Changed
- **Encryption**: Upgraded from Fernet (AES-128-CBC) to **AES-256-GCM** with authenticated encryption
- **Key Management**: Per-estate derived keys via PBKDF2-SHA256 (600,000 iterations)
- **Storage**: Documents moved from MongoDB blobs to **cloud object storage** (LocalStorage dev / S3 prod)
- **Messages**: Title and content now **encrypted at rest** with AES-256-GCM
- **Digital Wallet**: Passwords encrypted with per-estate keys (not global key)
- **Audit Trail**: SOC 2-compliant `security_audit_log` collection tracks all decrypt/access events
- **Backward Compat**: Legacy Fernet data auto-decrypted and lazily migrated on access

### New Files
- `backend/services/encryption.py` — AES-256-GCM encrypt/decrypt, per-estate key derivation
- `backend/services/storage.py` — Cloud storage abstraction (LocalStorage, S3Storage)
- `backend/services/audit.py` — SOC 2 security audit trail

### New API Endpoints
- `GET /api/vault/security-info/{estate_id}` — Returns encryption metadata and vault stats

### Architecture
```
User uploads document → AES-256-GCM encrypt (per-estate key) → Store encrypted blob in S3
User downloads document → Fetch from S3 → AES-256-GCM decrypt → Return plaintext
Legacy document access → Detect Fernet → Decrypt with legacy key → Re-encrypt as AES-256-GCM → Migrate to S3
```

## Upcoming Tasks (Prioritized)
- P1: Re-enable OTP email via Resend (domain verification)
- P2: Animated logo (waiting on user asset)
- P2: Codemagic build verification
- P3: Mobile app deploy via Codemagic
