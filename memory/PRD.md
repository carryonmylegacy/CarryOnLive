# CarryOn™ - Estate Planning & Legacy Management Platform

## What's Been Implemented (Complete)

### Authentication
- Email/Password login with 6-digit OTP 2FA
- **SMS OTP option** - Users can choose to receive OTP via text message (requires Twilio setup)
- JWT tokens with 24-hour expiration
- Role-based access (benefactor, beneficiary, admin)

### Admin Portal
- User Management (view, delete users)
- Transition Verification Team (TVT) - review death certificates
- Designated Trustee Services (DTS) Management
- **Dev Switcher Configuration** - Admin can specify which benefactor/beneficiary accounts appear in the DEV quick-switch panel

### Benefactor Portal
- Document Vault (AES-256 encrypted)
- Milestone Messages (text/video with editable triggers and specific date options)
- Beneficiary Management with enhanced demographics
- Estate Guardian AI (document analysis, checklist generation, state-specific legal guidance)
- Immediate Action Checklist
- Designated Trustee Services
- Two-Level Section Security (Password + Voice Passphrase)
- Estate Readiness Score
- **Edit Functionality** - Edit beneficiary details and document metadata (name, category, notes)

### Beneficiary Portal
- Estate Hub with generational orbit visualization
- Pre-Transition view
- Death Certificate Upload (3-step wizard)
- Condolence Splash with 5-phase real-time status
- Post-Transition Dashboard
- Sealed Vault, Messages, Checklist access

### Beneficiary Management (Enhanced)
- Full demographics: First/Middle/Last Name, Suffix, DOB, Gender
- Contact: Email, Phone
- Address: Street, City, State, ZIP
- Additional: SSN (last 4), Notes
- **Invitation Flow**: Email invitations, status tracking, account creation from invitation links

## Test Accounts
- **Admin**: `founder@carryon.us` / `CarryOntheWisdom!`
- All other accounts wiped - ready for real user registration

## Key API Endpoints

### Authentication
- `POST /api/auth/login` - Login with email/password, supports `otp_method` (email/sms)
- `POST /api/auth/verify-otp` - Verify OTP
- `POST /api/auth/register` - Register new account
- `POST /api/auth/dev-login` - Bypass OTP (dev mode)

### Beneficiary Management
- `GET /api/beneficiaries/{estate_id}` - List beneficiaries
- `POST /api/beneficiaries` - Create beneficiary
- `PUT /api/beneficiaries/{beneficiary_id}` - Update beneficiary details
- `DELETE /api/beneficiaries/{beneficiary_id}` - Remove beneficiary
- `POST /api/beneficiaries/{beneficiary_id}/invite` - Send invitation email

### Document Vault
- `GET /api/documents/{estate_id}` - List documents
- `POST /api/documents/upload` - Upload new document
- `PUT /api/documents/{document_id}` - Update document metadata (name, category, notes)
- `DELETE /api/documents/{document_id}` - Delete document
- `GET /api/documents/{document_id}/download` - Download document

### Admin - Dev Switcher
- `GET /api/admin/dev-switcher` - Get dev switcher config
- `PUT /api/admin/dev-switcher` - Update dev switcher config
- `GET /api/dev-switcher/config` - Public endpoint for frontend

## Setting Up SMS OTP (Twilio)

To enable SMS verification codes, you need a Twilio account:

### Step 1: Create Twilio Account
1. Go to https://www.twilio.com/try-twilio
2. Sign up for a free account
3. Verify your email and phone number

### Step 2: Get Twilio Credentials
1. Go to Console → Account Info
2. Copy your **Account SID**
3. Copy your **Auth Token**
4. Go to Phone Numbers → Manage → Buy a Number
5. Purchase a phone number with SMS capability (~$1/month)

### Step 3: Add to Backend Environment
Add these to `/app/backend/.env`:
```
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

### Step 4: Restart Backend
```bash
sudo supervisorctl restart backend
```

### Costs
- Twilio Phone Number: ~$1/month
- SMS Messages: ~$0.0079 per message (US)
- Free trial includes $15 credit

## Upcoming Tasks (P1)
1. **Push Notifications** - PWA features for important event alerts
2. **Multi-estate Support** - Manage multiple estates per benefactor

## Future/Backlog (P2)
1. **Payment Gateway** - Stripe integration
2. **Digital Asset Management** - Cryptocurrency, social media
3. **PDF Export** - Estate plan summaries

## Known Configuration Notes
- **Resend Email**: Currently uses fallback (logs OTP). For production, configure valid Resend API key with matching domain.
- **SMS OTP**: Requires Twilio setup (see above)
