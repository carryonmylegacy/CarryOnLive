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

### Session: Feb 2026 - UX Tweaks (Current)
- **Edit Beneficiary Page**: Removed security encryption blurb, replaced Upload/Add Photo button with camera icon inside avatar circle, added slide-in-from-right animation on desktop, staggered bounce-in animations on form cards
- **Edit Milestone Message Page**: Added slide-in-from-right animation on desktop, staggered bounce-in card animations, cleaned up old modal reference text
- **Digital Access Vault (DAV)**: Replaced modal-based edit dialog with elegant slide-in panel from the right, matching the edit beneficiary/milestone page style, with bouncy card animations
- **CSS Animations**: Added slideInRight, bounceIn, panelSlideIn/panelSlideOut keyframes with media query breakpoints (768px) for responsive behavior

### Previous Sessions
- Full edit flow refactor: Replaced broken modal dialogs with dedicated route-based edit pages (/beneficiaries/:id/edit, /messages/:id/edit)
- Housekeeping script enhanced with eslint and bandit checks
- Multi-portal architecture (Benefactor, Beneficiary, Admin, Operations)
- Stripe payment integration
- xAI (Grok) AI integration
- AWS S3 document storage
- Resend email service
- Google Places address autocomplete
- Capgo live updates
- CodeMagic CI/CD

## Architecture
- Backend: FastAPI + MongoDB (MONGO_URL from .env)
- Frontend: React + Capacitor (REACT_APP_BACKEND_URL from .env)
- Authentication: JWT-based
- File storage: S3-compatible

## Blocked / Awaiting User Action
- P1: Twilio SMS OTP Integration (blocked on A2P 10DLC approval)
- P1: iOS Share Extension Setup (blocked on user Xcode/App Store Connect config)

## Backlog
- No additional tasks pending

## Key Routes
- /beneficiaries/:beneficiaryId/edit → EditBeneficiaryPage
- /messages/:messageId/edit → EditMilestoneMessagePage
- /digital-wallet → DigitalWalletPage (with slide-in edit panel)

## Test Credentials
- Founder: info@carryon.us / Demo1234!
- Test Benefactor: fulltest@test.com / Password.123
