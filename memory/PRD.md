# CarryOn™ - Estate Planning Application

## Original Problem Statement
A full-stack estate planning application allowing benefactors to manage digital estates, beneficiaries, documents, and messages. Features role-based access (admin, benefactor, beneficiary), invitation system, orbit visualization for family connections, and Stripe/IAP subscriptions.

## Core Architecture
- **Frontend**: React (CRA) + Shadcn/UI + TailwindCSS
- **Backend**: FastAPI + MongoDB (motor async)
- **Auth**: JWT-based with optional OTP (currently disabled globally)
- **Storage**: AWS S3 for documents, base64 for photos
- **Integrations**: xAI (Grok), Stripe, Apple IAP, AWS S3, Resend, Google Places, Capgo, CodeMagic, Railway, Vercel

## Key Data Models
- **users**: email, password, role (admin/benefactor/beneficiary), is_also_benefactor, photo_url
- **estates**: owner_id, beneficiaries[], name
- **beneficiaries**: estate_id, user_id, email, photo_url, invitation_status, invitation_token
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

### Completed (This Session - March 12, 2026)
- **P0 Bug Fix: Account Lockout on Existing Email**
  - Fixed `create_beneficiary` to NOT auto-accept when email matches existing user
  - Email lookup normalized with `.lower().strip()` for case-insensitive matching
  - Invitation stays "pending", user_id pre-linked only
  - Existing user's credentials never modified, can still log in
  - Full invitation flow preserved (send invite → set password → accept)

- **P0 Bug Fix: Photo Not Displaying in Orbit**
  - Added photo fallback in `GET /api/beneficiary/family-connections`: checks beneficiary records when `users.photo_url` is empty
  - Added photo fallback in `GET /api/estates`: `owner_photo_url` falls back to owner's beneficiary record photo
  - Added photo fallback in `GET /api/beneficiaries/{estate_id}`: falls back to linked user's `users.photo_url`

- **Enhancement: Auto-sync beneficiary photo to user profile on invitation accept**
  - New users get the beneficiary record's photo copied to their `users.photo_url` on account creation
  - Existing users get the photo synced only if they don't already have one
  - User's own profile photo upload always overwrites the synced photo

## Prioritized Backlog

### P1 - Upcoming
- Finalize Share Extension Setup (instructions in /app/memory/SHARE_EXTENSION_SETUP.md)
- Twilio SMS OTP Integration (blocked on user's A2P 10DLC approval)

### P2 - Future
- Remaining ~18 ESLint warnings cleanup (mostly hook dependencies, Shadcn)
- Scalability enhancements (horizontal scaling, background workers, CDN)
- Settings page "flash" glitch investigation (not reproducible)

## Key API Endpoints
- POST /api/beneficiaries - Create beneficiary (fixed: no auto-accept)
- GET /api/beneficiaries/{estate_id} - List beneficiaries (fixed: photo fallback)
- GET /api/beneficiary/family-connections - Orbit data (fixed: photo fallback)
- GET /api/estates - User's estates (fixed: owner photo fallback)
- POST /api/accounts/create-estate - Beneficiary becomes benefactor
- POST /api/invitations/accept - Accept beneficiary invitation

## Mocked Integrations
- Twilio SMS OTP (scaffolded, awaiting A2P 10DLC approval)

## Test Credentials
- Admin: info@carryon.us / Demo1234!
