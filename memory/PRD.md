# CarryOn Estate Planning Platform - PRD

## Original Problem Statement
Multi-portal estate planning platform (CarryOn) with FastAPI backend, React/Capacitor frontend, and MongoDB. Features include secure document vault, milestone messages, beneficiary management, digital access vault (DAV), guardian AI, and more.

## Core Requirements
- Benefactor portal for managing estate documents, beneficiaries, and messages
- Beneficiary portal for accessing shared estate information post-transition
- Admin/Operations portal for platform management
- SOC 2 compliance with AES-256 encryption
- iOS PWA and native app support via Capacitor

## What's Been Implemented

### Session: Feb 2026 - SlidePanel UX Overhaul (Current)
- **Reusable SlidePanel component** (`/app/frontend/src/components/SlidePanel.js`): Replaces all Dialog modals for edit/create flows. Slides in from right. Desktop: fills content area (minus sidebar). Mobile: full screen, slides under floating nav bar (z-45 < nav z-50), respects safe areas.
- **Beneficiaries page**: Add and Edit beneficiary now use SlidePanel instead of Dialog modal or route navigation
- **Messages page**: Create and Edit milestone messages now use SlidePanel instead of Dialog modal or route navigation. Edit pencil opens panel inline (no page transition).
- **Vault (SDV) page**: Upload Document and Edit Document now use SlidePanel instead of Dialog modal
- **DAV page**: Fixed panel height (was too high in PWA), fixed "Getting Started" popup showing on every entry (now only first)
- **Performance**: Core pages (Dashboard, Vault, Messages, Beneficiaries, DigitalWallet) eagerly imported instead of lazy-loaded — eliminates skeleton flash delay between sections
- **CSS animations**: slideInRight, bounceIn, panelSlideIn/Out keyframes + SlidePanel structural CSS

### Previous Sessions
- Edit flow refactor: Original modal-to-page refactor (now superseded by SlidePanel approach)
- Camera icon in avatar circle for Edit Beneficiary photo upload
- Housekeeping script with eslint and bandit checks
- Multi-portal architecture (Benefactor, Beneficiary, Admin, Operations)
- Stripe, xAI (Grok), AWS S3, Resend, Google Places, Capgo, CodeMagic integrations

## Architecture
- Backend: FastAPI + MongoDB (MONGO_URL from .env)
- Frontend: React + Capacitor (REACT_APP_BACKEND_URL from .env)
- Authentication: JWT-based
- File storage: S3-compatible
- UI Pattern: SlidePanel for all edit/create flows (no Dialog modals)

## Blocked / Awaiting User Action
- P1: Twilio SMS OTP Integration (blocked on A2P 10DLC approval)
- P1: iOS Share Extension Setup (blocked on user Xcode/App Store Connect config)

## Backlog
- No additional tasks pending

## Key Components
- `/app/frontend/src/components/SlidePanel.js` — Reusable slide-in panel
- Route-based edit pages still exist as deep-link fallbacks but are not primary UX

## Test Credentials
- Founder: info@carryon.us / Demo1234!
- Test Benefactor: fulltest@test.com / Password.123
