# CarryOn - Family Preparedness Platform

## Original Problem Statement
Build and maintain a comprehensive family preparedness platform that helps users organize their estate plans, secure important documents, and leave messages for beneficiaries.

## Architecture
- Frontend: React (CRA + Craco) + Capacitor
- Backend: FastAPI + MongoDB
- Storage: S3-compatible object storage
- Auth: JWT + OTP + Passkeys
- Production: frontend on carryon.us (www), backend on Render (`carryon-api-kacr.onrender.com`) — **Render is currently running stale code; user must redeploy**

## Detailed session logs (read these for handoff depth)
- `/app/memory/SESSION_2026-09-16_marketing_overhaul.md` — positioning audit fixes, real screenshots pipeline, Readiness Quiz (frontend + backend + Founder Portal analytics + email follow-up), all test IDs, gotchas
- `/app/memory/test_credentials.md` — admin + production demo account (`petemitchell`)
- `/app/memory/SHARE_EXTENSION_SETUP.md` — iOS share extension (future task)

## What's Been Implemented

### Completed (Sep 16, 2026 — heycatch.ai Paywall & Pricing D4)
- `/pricing` rewritten around the confirmed model: **one plan for you; people you invite pay nothing while you're alive; after your passing they may keep access at `ben_price`/mo** (30-day grace). No free tier (decision) — free entry = explore 30 days, no card + hospice free
- Per-price value anchors (≈ $/day · $/year), attorney-hour comparison computed from live prices, 3-step "How pricing works", "Why monthly, why more than three prices" explainer, effective-price example, reduced-pricing tiers behind a "Do you qualify?" collapsible (`#reduced`), comparison table rows in plain language + invited-people rows. `/start` copy aligned
- Tested: iteration_66 all PASS; housekeeping 65/65
- Follow-up flagged: `SubscriptionPaywall.js` Family Plan tile still has hardcoded $3.49 / $1 copy (legacy) — make dynamic

### Completed (Sep 16, 2026 — heycatch.ai Trust & Social Proof D3, zero fabrication)
- **Real testimonial pipeline**: `routes/testimonials.py` — public submit (consent, 40–600 chars, `verified_member` if email matches a user) → Founder Portal **Marketing → Testimonials** (approve/reject/feature/edit/delete) → public list returns approved only (email never exposed) → `TestimonialsBlock` in homepage trust block + `/customers`. Honest empty state until the first approval
- **`/customers`** page (honest empty state, real screenshots, founder video + card, "Share your story" form) and **`/changelog`** page fed by `public/changelog.json` (append on every release) + "Last product update" line in trust block
- **FounderCard** (photo/initials, LinkedIn, → /about) in trust block; Organization JSON-LD gains `founder` Person; `/about` emits Person JSON-LD. **USER ACTION: upload real founder photo + LinkedIn in Founder Portal → Site Content**
- **LiveStats** — real DB counts (`GET /api/public/platform-stats`), shown only when ≥ 25 families or forced via Site Content → "Live Platform Numbers" (auto/on/off). Decision: no money-back guarantee
- **TrustBadges** (no card to explore · cancel anytime · Stripe-secured · export anytime) on trust block, `/pricing`, `/start`, `/customers`; footer links Customer Stories + What's New; About page nav → `/#…` + mobile menu
- Tested: iteration_65 (13 backend pytest + full frontend PASS, all test data cleaned); housekeeping 65/65 PASS

### Completed (Sep 16, 2026 — heycatch.ai Conversion Clarity Fixes D2.1–D2.5, D2.B)
- Hero CTA hierarchy: primary **Start Now** → `/start`, secondary "See it in action" → `#preview`, micro-line "Explore first — no credit card needed · quiz · pricing" (`components/landing/HeroCtas.js`, used on `/` and `/login` desktop+mobile); hero Sign In button removed
- Hero product visual: real dashboard screenshot below CTAs (`HeroShot.js`; browser frame / phone frame, fade mask)
- Mobile hamburger nav (`MobileNav.js`, `MARKETING_LINKS` single source for both pages' nav); `/login` nav "Open Account" → "Start Now"
- Viewport meta zoomable on web (`index.html`); locked only for native/PWA at runtime (`App.js`)
- Shorter scroll: feature cards in 2-col grid (arrow removed); Five Steps = `StepsShowcase.js` with sticky per-step phone screenshot (desktop); preview default tab = vault
- Scope-honesty block "Built for / Probably not for" in the problem section
- Tested: iteration_64 (67/67 PASS); housekeeping 65/65 PASS

### Completed (Sep 16, 2026 — Quiz Tracking + Email Follow-Up + Founder Analytics)
- **Backend** `routes/quiz.py`: `POST /api/quiz/results` (anonymous, validated, score/tier computed server-side, stores answers/utm/page/device), `POST /api/quiz/results/{id}/email` (validates via `services.email`, sends branded Resend email with score + 3 fixes + `/start` CTA, stores lead), `GET /api/admin/quiz/analytics` (admin + marketing scope). Collection `readiness_quiz_results` (indexes id/created_at/email). `/api/quiz/*` rate-limited 60/min/IP
- **Frontend**: `ReadinessQuiz.js` posts results on reaching the result screen; `EmailCapture` form ("Want this in your inbox?") with validation/error/sent states. New Founder Portal tab **Marketing → Readiness Quiz** (`/admin/quiz`, `components/admin/QuizAnalyticsTab.js`): metrics, "Where families feel least prepared" gap chart, histogram, tiers, by source/device, Leads table + CSV export, Recent results
- Tested: iteration_63 (11 backend pytest + frontend PASS); live email delivered to info@carryon.us

### Completed (Sep 16, 2026 — Mobile Screenshots + Readiness Quiz)
- **Phone screenshots**: `ProductPreview` renders a phone frame (< md) with real iPhone-14-viewport screenshots `/screenshots/m-{dashboard,vault,contacts,checklist}.webp` (780×1328) and the desktop browser frame (≥ md) with the 1440px shots. Capture script supports `SHOT_MODE=mobile`; hides `onboarding-wizard`, `push-notification-prompt`, `lock-banner-*` by test ID and injects the checklist mobile CSS fix so shots match the shipped UI
- **Readiness Quiz** (`components/landing/ReadinessQuiz.js`, section `#quiz`, after the problem section on `/` and `/login`): 8 questions × (Yes 2 / Partly 1 / No 0) → 0–100 score ring, 3 tiers (≥75 / ≥40 / <40), top-3 "Fix these first", CTA → `/start?utm_source=readiness_quiz&utm_medium=homepage&utm_content=score_NN` (+ sessionStorage `carryon_quiz_score`), Retake. "Readiness Quiz" nav link on both pages
- **App fix**: Immediate Action Checklist item cards wrap badge/actions under the title on phones (`ChecklistPage.renderItemCard`)
- Tested: iteration_62 all PASS; housekeeping 65/65 PASS

### Completed (Sep 16, 2026 — heycatch.ai Positioning Audit Fixes D1.1–D1.6)
- **D1.1**: Hero H1 "Get your family's affairs in order — in one secure place." with "Every American Family. Ready." as gold eyebrow (`components/landing/heroCopy.js`, shared by HomePage + LoginPage)
- **D1.1**: Root `/` renders marketing HomePage for new web visitors (`RootRoute` in App.js); native/PWA/returning users (localStorage `carryon_token`) → `/login`. `/login` canonical is now `/login`
- **D1.5**: "See inside CarryOn" product preview (`components/landing/ProductPreview.js`, `#preview`) with REAL screenshots from the live production account `petemitchell` — recapture: `SHOT_USER=petemitchell SHOT_PASS=... /opt/plugins-venv/bin/python /app/scripts/capture_product_screenshots.py`. "See How It Works" scrolls to it
- **D1.6**: Acronym chips removed; 8 feature cards lead with plain-language titles, product name as sub-label; purged "eight pillars", "benefactor", "per-estate encryption", "readiness infrastructure", "digital family preparedness platform"; hero badges "AES-256 encrypted / Your own encryption key / Two-step sign-in"
- **D1.2**: "Nobody knows where anything is. Until now." pain-led section
- **D1.3**: Outcomes grid (emotional + social JTBD)
- **D1.4**: Honest trust block "We're new. Here's what we can promise." + FAQ "CarryOn is new. How do I know it will be around?" — no fabricated social proof
- JSON-LD/meta in plain language; GetStartedPage "Join families across the country" claim removed
- Tested: iteration_61 (12/12 PASS); housekeeping 65/65 PASS
- Note: yarn.lock regenerated via `yarn install` to include react-helmet-async (was missing from committed lock) — do not revert

### Completed (Sep 15, 2026 — heycatch.ai Audit Fixes)
- **D4.1/D2.4**: Added "Pricing" link to homepage nav + "Get Started" CTA button in nav bar
- **D2.2**: Replaced "Scroll to explore" with "See How It Works" CTA + "View Pricing" text link
- **D1.1/D1.2/D1.6**: Rewrote hero subhead with audience language: "So your family knows where everything lives, who to call first, and what to do next — if something happens to you"
- **D1.4**: Added 5-question FAQ section (expandable accordion) with FAQPage JSON-LD schema
- **D5.1**: Differentiated page titles/meta descriptions across /about, /pricing, /privacy, /terms
- **D4.3**: Added value anchoring on pricing page (estate attorney cost comparison + 570-hour statistic)
- **D4.2**: Added "Compare Plans" feature comparison table + "Which plan is right for you?" decision helper
- **D5.5**: Added Organization JSON-LD schema + consolidated WebApplication schema
- **D3.3**: Added founder block (Barnet Harris, 24-year military veteran bio) on /about page; Founder Profile CMS (photo via Base64 JSON, LinkedIn) in Admin Site Content
- **Footer**: Added Pricing and About links to LandingContent footer

### Completed (Sep 15, 2026 — Revenue Funnel & Phase 3)
- Stripe Subscription Migration (native mode, 18 prices)
- `/start` two-door funnel, `/pricing` portal-driven page
- Trial → "exploration period" language, non-dismissable TrialBanner
- UTM capture (`sessionStorage.carryon_utm` in StartPage → SignupPage), Resend bounce handlers
- Phase 3 Zero-Regression: All 9 tests PASSED
- SEO: react-helmet-async, per-page JSON-LD, sitemap expanded

### Completed (Previous Sessions)
- Full auth system, beneficiary management, milestone messages
- Secure Document Vault (AES-256-GCM), Estate Guardian AI
- CarryOn Financial Portal (CFP) with 3 sub-modules
- Push notifications, email deliverability fix
- iOS/Capacitor hybrid, Apple IAP integration
- Admin/Founder multi-portal, feature gates

## 🔴 P0 BLOCKER (Sep 16 night) — production backend is a DIFFERENT codebase
- Live Render API (`/api/health` build `2026-04-28 pre-launch-refactor`) serves a Seniors plan, free_mode tier, CFP/BEC/CES/TMA feature gates, launch/final pricing — none of which ever existed in this repo (verified with `git log -S` over 4,686 commits). This repo's backend (build string stuck at `2026-03-10`) has quiz/testimonials/platform-stats/founder-profile which 404 on production. Production frontend IS from this repo (Sep 16 build).
- **Do NOT deploy this backend to Render and do NOT "Save to GitHub" onto the Render branch until reconciled** — it would delete the Seniors tier & extra gates from the live product.
- User decision: option **b** — reconcile backends first, then make every feature live in both environments and keep the preview DB mirroring live config. Awaiting user-pasted Render/GitHub/Emergent info (instructions given Sep 16 night).
- Full audit + evidence + fix plan: `/app/memory/PUBLIC_CLAIMS_AUDIT.md` (claims matrix for all 13 public pages; user rulings: plain-language security copy, no "nationwide network/three teams", no "iOS and Android apps" yet, 24h verification OK, 76% stat OK, portal gates are the source of truth for tier features).

## Blocked Items (user action)
- **Deploy**: see P0 above — reconcile before any Render deploy
- Apple IAP: Waiting on Paid Applications Agreement
- Twilio SMS: Waiting on A2P 10DLC campaign approval

## Upcoming Tasks
- (P1) Ask real members to share their story at carryon.us/customers, then approve in Founder Portal → Testimonials — USER ACTION NEEDED (pipeline is live; nothing shows until approved)
- (P1) Upload real founder photo + LinkedIn URL in Founder Portal → Site Content (preview DB has a test image) — USER ACTION NEEDED
- (P1) Replace OG image from favicon to 1200x630px preview image (D5.5) — USER ACTION NEEDED
- (P2) 5th product-preview tab for Milestone Messages once the `petemitchell` demo account has a polished example message
- (P2) After production deploy, re-run the capture script so the checklist screenshot reflects the shipped CSS (currently injected at capture time)
- (P2) Build /vs comparison pages (D5.3); build a real /features page before linking it
- (P2) iOS Font Size Fix (38 sub-11px fonts, housekeeping WARN #50)
- (P3) Quiz: weekly stats digest email to founder; A/B result-screen CTA copy

## Future/Backlog
- Google Play Store Launch
- iOS Share Extension Setup
- iOS Live Updates (Capgo)
- Readiness Scoring Policy Page
- ECT Security Comparison Landing Page

## Key Technical Notes
- Housekeeping: `bash /app/housekeeping.sh` must pass (currently 65/65) before every push
- Dynamic Pricing: Never hardcode prices — always from Founder Portal DB
- LIVE Stripe keys and LIVE Resend in use — quiz email tests only to info@carryon.us
- Beta mode currently ON
- JSON-LD rendered via dangerouslySetInnerHTML (not inside Helmet)
- react-helmet-async: HelmetProvider wraps app in App.js
- File uploads: Base64 JSON only (production proxy blocks multipart)
- Marketing copy: keep `QUESTIONS` in `routes/quiz.py` and `ReadinessQuiz.js` in sync by index; avoid forbidden jargon list in the session log §3
- NEVER seed/fabricate testimonials or stats. Tests must delete any testimonial they create and restore `show_live_stats` to `auto`. Append real releases to `frontend/public/changelog.json`
- Screenshot capture needs `/opt/plugins-venv/bin/python` (Playwright) + `/usr/bin/chromium`; run after `yarn install` → `sudo supervisorctl restart frontend`
