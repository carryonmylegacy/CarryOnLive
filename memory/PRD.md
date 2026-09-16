# CarryOn - Family Preparedness Platform

## Original Problem Statement
Build and maintain a comprehensive family preparedness platform that helps users organize their estate plans, secure important documents, and leave messages for beneficiaries.

## Architecture
- Frontend: React (CRA + Craco) + Capacitor
- Backend: FastAPI + MongoDB
- Storage: S3-compatible object storage
- Auth: JWT + OTP + Passkeys

## What's Been Implemented

### Completed (Sep 16, 2026 — heycatch.ai Positioning Audit Fixes, 16/25 → target 22+)
- **D1.1**: New hero H1 "Get your family's affairs in order — in one secure place." with "Every American Family. Ready." demoted to a gold eyebrow (shared via `components/landing/heroCopy.js`, used by HomePage + LoginPage desktop/mobile heroes)
- **D1.1**: Root `/` now renders marketing HomePage for new web visitors (`RootRoute` in App.js); native/PWA/returning users (localStorage `carryon_token`) still go to `/login`. `/login` unchanged functionally; canonical moved to `/login`
- **D1.5**: New interactive "See inside CarryOn" product preview (`components/landing/ProductPreview.js`, `#preview`) — 4 tabs (dashboard readiness score, document vault, who to call first, what to do first) rendered live with a sample family. "See How It Works" CTA now scrolls to it
- **D1.6**: All acronym chips (MM/SDV/EGA/IAC/CCP/ECT/DAV/FFN) removed; 8 feature cards lead with plain-language titles, product name as sub-label. Purged "eight pillars", "benefactor", "per-estate encryption", "readiness infrastructure", "digital family preparedness platform" from marketing copy; hero badges now "AES-256 encrypted / Your own encryption key / Two-step sign-in"
- **D1.2**: "More Than Estate Planning" → "Nobody knows where anything is. Until now." (pain-led copy in audience words)
- **D1.3**: New outcomes grid (emotional + social JTBD): "Stop carrying it in your head / Be the one who made it easy / No awkward conversations required"
- **D1.4**: Honest trust block "We're new. Here's what we can promise." (founder accountability → /about, nobody can read your docs, export/cancel anytime, exploration period) + FAQ #2 "CarryOn is new. How do I know it will be around?" — no fabricated social proof
- JSON-LD/meta rewritten in plain language; GetStartedPage step-4 "Join families across the country" claim removed
- Tested: iteration_61 (all 12 areas PASS); housekeeping 65/65 PASS (pre-existing WARN #50 sub-11px fonts)
- Note: yarn.lock regenerated via `yarn install` to include react-helmet-async (was missing from committed lock)

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
- (P1) Collect 3-5 real user testimonials with photos (D3.1, D3.2) — USER ACTION NEEDED (trust block explicitly says "when our first families are ready to speak, you'll see them here")
- (P1) Optional: replace React product preview with real annotated screenshots once user approves sharing UI (D1.5 — interactive preview already shipped)
- (P1) Replace OG image from favicon to 1200x630px preview image (D5.5) — USER ACTION NEEDED
- (P1) Deploy latest backend on Render so /about founder photo shows in production — USER ACTION NEEDED
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
