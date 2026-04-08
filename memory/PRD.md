# CarryOn - Family Preparedness Platform

## Original Problem Statement
Build and maintain a comprehensive family preparedness platform that helps users organize their estate plans, secure important documents, and leave messages for beneficiaries.

## Core Requirements
- Secure document vault with AES-256 encryption
- Milestone messaging (written, voice, video) 
- Beneficiary management with succession ordering
- AI-powered Estate Guardian advisor
- Immediate Action Checklist for beneficiaries
- Digital Access Vault for account credentials
- Guided onboarding / Getting Started flow
- Multi-role support (Benefactor, Beneficiary, Admin/Founder)
- iOS/PWA hybrid with Capacitor
- CarryOn Contingency Protocols (CCP) — family emergency plans
- Estate Communication Tool (ECT) — secure family chat

## Architecture
- Frontend: React (CRA + Craco) + Capacitor
- Backend: FastAPI + MongoDB
- Storage: S3-compatible object storage
- Auth: JWT + OTP + Passkeys
- Deployment: Vercel

## What's Been Implemented

### Completed (All Sessions)
- Full authentication system (JWT, OTP, passkeys, session enforcement)
- Beneficiary management with drag-to-reorder succession
- Milestone Messages (written, voice, video with S3 storage)
- Secure Document Vault (AES-256-GCM, voice unlock)
- Estate Guardian AI chat
- Immediate Action Checklist with AI generation
- Digital Access Vault
- Admin/Founder multi-portal system
- Stripe payments + Apple IAP integration
- Family Plan support
- Notification system (in-app + email)
- SEO (robots.txt, sitemap.xml, meta tags)
- State-sync audit (photo, video, voice deletion desyncs fixed)
- Narrative copy updated to "family preparedness"
- Getting Started UX Overhaul (foolproof for elderly/non-tech users)
- CCP First-Visit Welcome Walkthrough
- ECT Enhanced Security Intro
- xAI keepalive optimization (on-demand warmup)

### Completed (Current Session — Apr 8, 2026)
- **Invitation Existing Account Linking (P0)**: Fixed critical bug where existing users couldn't accept an invitation without hitting a "username taken" error.
  - Added `POST /api/invitations/accept-existing` endpoint in `beneficiaries.py`
  - Added "I Have an Account" toggle in `AcceptInvitationPage.js`
  - Fixed missing `verify_password` import (would have caused runtime crash)
  - Fixed stale `_xai_keepalive_task` import in `server.py` shutdown handler
  - Tested: 10/10 backend tests passed, all frontend flows verified

## Blocked Items
- Apple IAP: Waiting on Paid Applications Agreement
- Twilio SMS: Waiting on A2P 10DLC campaign approval

## Upcoming Tasks
- (P0) Google Play Store Launch
- (P1) Share Extension Setup (iOS)
- (P1) iOS Live Updates (Capgo)

## Future/Backlog
- (P2) Readiness Scoring Policy Page
- (P3) ECT Security Comparison Landing Page

## Key Technical Notes
- Housekeeping: `bash /app/housekeeping.sh` must pass 65/65 before every push
- State sync: Frontend media removals must explicitly call backend DELETE endpoints
- Narrative: Use "family preparedness" not "estate planning"
- MongoDB: Always exclude `_id` from responses
- First-visit intros use localStorage: `carryon_ccp_intro_seen`, `ect_security_seen`
