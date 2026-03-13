# CarryOn™ - Estate Planning Application

## Original Problem Statement
A full-stack estate planning application allowing benefactors to manage digital estates, beneficiaries, documents, and messages. Features role-based access (admin, benefactor, beneficiary), invitation system, orbit visualization for family connections, and Stripe/IAP subscriptions.

## Core Architecture
- **Frontend**: React (CRA) + Shadcn/UI + TailwindCSS
- **Backend**: FastAPI + MongoDB (motor async)
- **Auth**: JWT-based with optional OTP (currently disabled globally)
- **Storage**: AWS S3 for documents AND photos (migrated from base64)
- **Integrations**: xAI (Grok), Stripe, Apple IAP, AWS S3, Resend, Google Places, Capgo, CodeMagic, Railway, Vercel

## Key Data Models
- **users**: email, password, role (admin/benefactor/beneficiary), is_also_benefactor, photo_url (now S3 URL path)
- **estates**: owner_id, beneficiaries[], name, estate_photo_url (now S3 URL path)
- **beneficiaries**: estate_id, user_id, email, photo_url (now S3 URL path), invitation_status, invitation_token
- **beneficiary_display_overrides**: user_id, estate_id, owner_photo_url

## What's Been Implemented

### Completed (Previous Sessions)
- Full auth system (register, login, OTP, password reset)
- Estate management (CRUD, beneficiary enrollment)
- Beneficiary management (add, edit, invite, accept, photo upload)
- Document vault with S3 storage
- Messaging system
- Orbit visualization for family connections
- Admin dashboard with system health, revenue, code health tiles
- Stripe + Apple IAP subscription management
- RBAC abstraction via guards.py
- ESLint cleanup (~168 warnings fixed)
- Component refactoring (AdminPage, UsersTab)

### Completed (March 12, 2026)
- P0 Bug Fix: Account Lockout on Existing Email
- P0 Bug Fix: Photo Not Displaying in Orbit
- Enhancement: Auto-sync beneficiary photo to user profile on invitation accept
- Production Deployment Stabilization (Railway)
- Comprehensive Code Optimization (N+1 queries, indexes, dependency cleanup)
- housekeeping.sh enhancements (3 new validation checks)

### Completed (March 13, 2026)
- **P0: S3 Photo Migration** - All user, beneficiary, and estate photos migrated from base64 in MongoDB to S3 object storage
  - New: `services/photo_storage.py` - Image processing (resize, optimize) and S3 upload
  - New: `services/photo_urls.py` - URL resolution for backward-compatible API responses
  - New: `routes/photos.py` - Serving endpoint GET /api/photos/{key} with Cache-Control headers
  - Updated: `PUT /api/auth/profile-photo` - Stores in S3 instead of base64
  - Updated: `POST /api/beneficiaries/{id}/photo` - Stores in S3 instead of base64
  - Updated: `PUT /api/estates/{estate_id}/photo` - Stores in S3 instead of base64
  - Updated: `DELETE /api/beneficiaries/{id}/photo` - Deletes from S3
  - Storage backend: `services/storage.py` extended with `upload_raw()` for arbitrary keys
  - Frontend: `utils/photoUrl.js` - `resolvePhotoUrl()` utility for URL resolution in all components
  - Updated all frontend components displaying photos: PhotoPicker, BeneficiariesPage, OrbitVisualization, FamilyTree, MessagesPage, BeneficiaryHubPage, TrusteePage, EditMilestoneMessagePage, EditBeneficiaryPage, OnboardingPage

- **P0: GZip Compression** - Added `GZipMiddleware` to FastAPI (minimum_size=500 bytes)
  - All API responses >500 bytes are compressed, reducing network payload

## Prioritized Backlog

### P1 - Upcoming
- Finalize Share Extension Setup (instructions in /app/memory/SHARE_EXTENSION_SETUP.md)
- Twilio SMS OTP Integration (blocked on user's A2P 10DLC approval)
- Migration script: Convert existing base64 photos in production DB to S3 (one-time admin tool)

### P2 - Future
- Remaining ~18 ESLint warnings cleanup (mostly hook dependencies, Shadcn)
- Scalability enhancements (horizontal scaling, background workers, CDN)
- Settings page "flash" glitch investigation (not reproducible)

## Key API Endpoints
- POST /api/beneficiaries - Create beneficiary
- GET /api/beneficiaries/{estate_id} - List beneficiaries (with photo URL resolution)
- GET /api/beneficiary/family-connections - Orbit data (with photo URL resolution)
- GET /api/estates - User's estates (with photo URL resolution)
- GET /api/photos/{key:path} - Serve photos from S3/local storage
- PUT /api/auth/profile-photo - Upload profile photo to S3
- POST /api/beneficiaries/{id}/photo - Upload beneficiary photo to S3
- PUT /api/estates/{estate_id}/photo - Upload estate photo to S3

## Mocked Integrations
- Twilio SMS OTP (scaffolded, awaiting A2P 10DLC approval)

## Test Credentials
- Admin: info@carryon.us / Demo1234!
