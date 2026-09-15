# CarryOn - Family Preparedness Platform

## Original Problem Statement
Build and maintain a comprehensive family preparedness platform that helps users organize their estate plans, secure important documents, and leave messages for beneficiaries.

## Architecture
- Frontend: React (CRA + Craco) + Capacitor
- Backend: FastAPI + MongoDB
- Storage: S3-compatible object storage
- Auth: JWT + OTP + Passkeys

## What's Been Implemented

### Completed (Sep 15, 2026 — heycatch.ai Audit Fixes)
- **D4.1/D2.4**: Added "Pricing" link to homepage nav + "Get Started" CTA button in nav bar
- **D2.2**: Replaced "Scroll to explore" with "See How It Works" CTA + "View Pricing" text link
- **D1.1/D1.2/D1.6**: Rewrote hero subhead with audience language: "So your family knows where everything lives, who to call first, and what to do next — if something happens to you"
- **D1.4**: Added 5-question FAQ section (expandable accordion) between Security and Hospice sections with FAQPage JSON-LD schema
- **D5.1**: Differentiated page titles/meta descriptions across /about, /pricing, /privacy, /terms
- **D4.3**: Added value anchoring on pricing page (estate attorney cost comparison + 570-hour statistic)
- **D4.2**: Added "Compare Plans" feature comparison table + "Which plan is right for you?" decision helper
- **D5.5**: Added Organization JSON-LD schema (full address, contact, founding date) + consolidated WebApplication schema
- **D3.3**: Added founder block (Barnet Harris, 24-year military veteran bio) on /about page
- **Footer**: Added Pricing and About links to LandingContent footer

### Completed (Sep 15, 2026 — Revenue Funnel & Phase 3)
- Stripe Subscription Migration (native mode, 18 prices)
- `/start` two-door funnel, `/pricing` portal-driven page
- Trial → "exploration period" language, non-dismissable TrialBanner
- UTM capture, Resend bounce handlers
- Phase 3 Zero-Regression: All 9 tests PASSED
- SEO: react-helmet-async, per-page JSON-LD, sitemap expanded

### Completed (Previous Sessions)
- Full auth system, beneficiary management, milestone messages
- Secure Document Vault (AES-256-GCM), Estate Guardian AI
- CarryOn Financial Portal (CFP) with 3 sub-modules
- Push notifications, email deliverability fix
- iOS/Capacitor hybrid, Apple IAP integration
- Admin/Founder multi-portal, feature gates

## Blocked Items
- Apple IAP: Waiting on Paid Applications Agreement
- Twilio SMS: Waiting on A2P 10DLC campaign approval

## Upcoming Tasks (from audit)
- (P1) Collect 3-5 real user testimonials with photos (D3.1, D3.2) — USER ACTION NEEDED
- (P1) Add product screenshots to homepage and pillar cards (D1.5) — USER ACTION NEEDED
- (P1) Replace founder initials with real photo + add LinkedIn URL (D3.3) — USER ACTION NEEDED
- (P1) Replace OG image from favicon to 1200x630px preview image (D5.5) — USER ACTION NEEDED
- (P2) Build /vs comparison pages (D5.3)
- (P2) Build /customers page with real stories (D3.2)
- (P2) iOS Font Size Fix (37 sub-11px fonts)

## Future/Backlog
- Google Play Store Launch
- iOS Share Extension Setup
- iOS Live Updates (Capgo)
- Readiness Scoring Policy Page
- ECT Security Comparison Landing Page

## Key Technical Notes
- Housekeeping: `bash /app/housekeeping.sh` must pass 64+ before every push
- Dynamic Pricing: Never hardcode prices — always from Founder Portal DB
- LIVE Stripe keys in use — exercise caution
- Beta mode currently ON
- JSON-LD rendered via dangerouslySetInnerHTML (not inside Helmet)
- react-helmet-async: HelmetProvider wraps app in App.js
