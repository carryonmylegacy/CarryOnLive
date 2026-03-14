# CarryOn™ - Estate Planning Application

## Original Problem Statement
A full-stack estate planning application allowing benefactors to manage digital estates, beneficiaries, documents, and messages. Features role-based access (admin, benefactor, beneficiary), invitation system, orbit visualization for family connections, and Stripe/IAP subscriptions.

## Core Architecture
- **Frontend**: React (CRA) + Shadcn/UI + TailwindCSS + Capacitor (iOS/Android)
- **Backend**: FastAPI + MongoDB (motor async)
- **Auth**: JWT-based with optional OTP, supports login via username or email
- **Storage**: AWS S3 for documents AND photos (presigned URLs)
- **Integrations**: xAI (Grok), Stripe, Apple IAP, AWS S3, Resend, Google Places, Capgo, CodeMagic, Railway, Vercel

## Key Data Models
- **users**: email, password, username, username_lower, role, is_also_benefactor, is_also_beneficiary, photo_url (S3 key)
- **estates**: owner_id, beneficiaries[], name — **one user can own multiple estates**
- **beneficiaries**: estate_id, user_id, email, photo_url (S3 key), invitation_status
- **family_plans**: fpo_user_id, members[], $1/mo benefactor discount, $3.49 flat beneficiary rate

## What's Been Implemented

### Completed (March 13, 2026)
- **S3 Photo Migration**: All photos stored as S3 presigned URLs (not base64)
- **GZip Compression**: FastAPI GZipMiddleware for all responses
- **Multi-Estate Support**: Users can create multiple estates as benefactor (blended family scenario)
- **Sidebar Portal Switcher**: Single "My Benefactor Portal" pill (estate picker if 2+), single "My Beneficiary Portal" pill (goes to hub)
- **Light Mode Contrast Fix**: Darker accent colors (--bl3, --gn2, --pr2) for readable contrast
- **PhotoPicker Theme Fix**: Theme-aware button styles instead of hardcoded dark-mode colors
- **Portal Switcher Cache**: sessionStorage caching prevents config loss on page reload
- **FamilyTree Photo Fallback**: Estate nodes show owner_photo_url when estate_photo_url is missing
- **CI/CD Fix**: Pinned ruff version, Node.js 22, all CodeMagic env vars (Stripe, VAPID)
- **MongoDB Safety**: All projection warnings resolved with "id": 1
- **is_also_beneficiary Fix**: Flag correctly set when benefactor accepts invitation to another estate
- **Custom Estate Naming**: Editable estate name in Settings
- **AvatarCircle Component**: Camera icon overlay for photo uploads on empty avatars
- **Username Login**: Users can log in with either email or username
- **Custom Usernames**: All users can set a unique username in Settings (no verification needed)
- **Beneficiary Email Change → Re-invite**: When benefactor changes a beneficiary's email, invitation resets and prompts to resend
- **Login Field Updated**: Label and placeholder changed to "Username or Email"
- **FamilyTree Legend Fix**: Removed redundant "Blue nodes =" line, kept single "Blue = ..." line
- **App Freeze Fix**: Backend xAI call made non-blocking via asyncio.to_thread() in guardian.py
- **Admin Settings Access**: Settings page enabled for all admin roles with sidebar/mobile nav links
- **Admin Display Name Edit**: Admins can edit their own display name from Settings

### Completed (Feb 2026)
- **Guardian Chat Session Persistence (P0 Bug Fix)**: Fixed critical bug where Quick Action buttons (Analyze Vault, etc.) on the Guardian landing page generated mismatched session IDs — localStorage stored ID_A but API messages were saved under ID_B. Fix: `startNewChat` now accepts an `action` parameter and passes the same session ID via closure to `sendMessage`. Also added localStorage sync in `sendMessage` response handler.

## Subscription Architecture
- Each estate requires its own active subscription
- Family Plan: $1/mo discount per bundled benefactor, $3.49 flat beneficiary rate
- Beneficiary pricing locked to benefactor's >50% subscription tier after transition
- Floor-exempt tiers: military, hospice, new_adult

## Prioritized Backlog
### P1 - Upcoming
- Share Extension Setup (instructions in /app/memory/SHARE_EXTENSION_SETUP.md)
- Twilio SMS OTP Integration (blocked on A2P 10DLC approval)
- "Create New Estate" button in estate picker for multi-estate users

### P2 - Future
- Scalability enhancements (CDN for S3, horizontal scaling)
- Settings page "flash" glitch investigation

## Test Credentials
- Admin: info@carryon.us / Demo1234!
