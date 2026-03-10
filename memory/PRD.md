# CarryOn Estate Planning Platform - PRD

## Original Problem Statement
Multi-portal estate planning platform (CarryOn) with FastAPI backend, React/Capacitor frontend, and MongoDB. Features include secure document vault, milestone messages, beneficiary management, digital access vault (DAV), guardian AI, and more.

## Core Requirements
- Benefactor portal for managing estate documents, beneficiaries, and messages
- Beneficiary portal for accessing shared estate information post-transition
- Admin/Operations portal for platform management
- SOC 2 compliance with AES-256 encryption
- iOS PWA and native app support via Capacitor
- **Multi-role support**: One user can be both benefactor (own estate) AND beneficiary (in another estate) simultaneously

## What's Been Implemented

### Session: Mar 10, 2026 — Production Debugging & Diagnostics
- **Verified all multi-role features work in preview** (100% pass rate: 15/15 backend, 10/10 frontend)
- **Added build verification system**: `/api/health` now returns `build` hash, `/api/debug/user-state?email=X` returns computed multi-role state for diagnosing production issues
- **Added frontend build marker**: `window.__CARRYON_BUILD` console log on app load for verifying Vercel frontend deployment
- **Confirmed features working**: Welcome tile, ViewSwitcher, beneficiary population, onboarding wizard all verified with testing agent

### Session: Mar 10, 2026 — Ghost Estate Fix, SOC 2, Auth Refactor
- **Recurring Ghost Estate Bug Fix**: Enhanced estate creation to auto-detect and delete old incomplete "ghost" estates
- **SOC 2 Compliance**: Implemented soft-delete pattern across 7 routes, updated housekeeping audit script
- **Core Auth Model Refactor**: Added `is_also_benefactor` and `is_also_beneficiary` to `UserResponse` Pydantic model, refactored all auth endpoints to consistently return these flags
- **Multi-Role UI/UX**: Created ViewSwitcher component, fixed post-creation redirect, welcome tile for multi-role users
- **API Cache Invalidation**: `clearCache()` after estate creation
- **Admin Login Bug Fix**: Fixed regression preventing admin login

### Session: Mar 10, 2026 - Family Tree HTML/CSS + Admin Graph View + Estate Health
- Family Tree Component rebuilt from SVG to HTML/CSS
- Admin Graph View with HTML/CSS family trees per estate
- Estate Health Analytics with KPI cards and health scores
- "Dependents" renamed to "Beneficiaries" across UI
- CreateEstatePage UX improvements (address line 2, auto-populate)

### Previous Sessions
- Drag-to-Reorder beneficiaries, Admin redesign
- Multi-Role Estate Creation wizard
- SlidePanel UX, performance caching, unified notifications
- Multi-portal architecture
- Stripe, xAI (Grok), AWS S3, Resend, Google Places, Capgo, CodeMagic integrations

## Architecture
- Backend: FastAPI + MongoDB
- Frontend: React + Capacitor
- Authentication: JWT with multi-role flags (`is_also_benefactor`, `is_also_beneficiary`)
- File storage: S3-compatible
- UI Pattern: SlidePanel for edit/create, DnD Kit for drag-reorder

## Known Issues
- **P0 BLOCKED**: Production environment (Railway/Vercel) not reflecting code changes. Preview works perfectly. Diagnostic endpoints added to help debug.

## Upcoming Tasks
- P1: Finalize Share Extension Setup (per `/app/memory/SHARE_EXTENSION_SETUP.md`)
- P1: Twilio SMS OTP Integration (blocked on user's A2P 10DLC approval)

## 3rd Party Integrations
- xAI (Grok), Stripe, Apple In-App Purchase, AWS S3, Resend, Twilio (scaffolded), Google Places, Capgo, CodeMagic, @dnd-kit/core
- **Deployment**: Railway (Backend) + Vercel (Frontend)

## Test Credentials
- Founder: info@carryon.us / Demo1234!
- Test Account: fulltest@test.com / Password.123
