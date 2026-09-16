# Session Log — 16 Sep 2026 — Marketing Positioning Overhaul, Real Screenshots, Readiness Quiz

> Purpose: complete, self-contained record of everything built today so another agent can pick up
> without chat history. Read this top-to-bottom, then `/app/memory/PRD.md` for the wider product picture.

## 0. TL;DR

| # | What | Status | Verified by |
|---|------|--------|-------------|
| 1 | heycatch.ai "Positioning" audit fixes D1.1–D1.6 on the marketing pages (`/`, `/home`, `/login`) | DONE | test_reports/iteration_61.json, housekeeping 65/65 |
| 2 | Root `/` serves the marketing homepage to new web visitors (was → `/login`) | DONE | iteration_61 |
| 3 | "See inside CarryOn" product preview with **real** screenshots (desktop + phone) pulled from the live `petemitchell` account | DONE | iteration_62, manual review of every image |
| 4 | 60-second Readiness Quiz on `/` and `/login` (score, tiers, "Fix these first", CTA → `/start` with UTM) | DONE | iteration_62 |
| 5 | Quiz result tracking (backend) + optional email follow-up (Resend) + Founder Portal "Readiness Quiz" analytics tab | DONE | iteration_63, live email delivered to info@carryon.us |
| 6 | Real app fix: Immediate Action Checklist cards no longer squeeze titles on phones | DONE | iteration_62 |
| 7 | heycatch.ai "Conversion clarity" audit fixes D2.1–D2.5 + D2.B (CTA hierarchy, hero product shot, mobile hamburger, zoomable viewport, shorter scroll, scope honesty) | DONE | iteration_64 (67/67), housekeeping 65/65 |
| 8 | heycatch.ai "Trust signals & social proof" D3 — **no fabrication**: real-testimonial pipeline + moderation, /customers, /changelog, founder card, live real stats (gated), transactional badges, Person JSON-LD | DONE | iteration_65 (13 backend + full frontend PASS), housekeeping 65/65 |

All user-facing copy decisions were explicitly approved by the user (see §1).

---

## 1c. Trust & social-proof pass (D3) — what shipped (same day, later)

User decisions: **no money-back guarantee** (keep "cancel anytime" + "no card needed"); **live numbers only when ≥ 25 families exist, with a Founder Portal toggle (auto / on / off)**. Nothing invented anywhere.

| Audit item | Fix |
|-----------|-----|
| D3.1 quantity proof | `LiveStats` strip in the trust block shows **real counts from the DB** (`GET /api/public/platform-stats`: families = estates, documents, messages, checklist_items, people_invited; 10-min in-process cache). `visible` = `show_live_stats == 'on'` or (`'auto'` and families ≥ 25). Toggle lives in Founder Portal → Site Content → "Live Platform Numbers" (`live-stats-mode-auto|on|off`). Preview DB has 111 test estates → visible in preview; production decides itself. |
| D3.2 story proof | **Real testimonial pipeline** (`routes/testimonials.py`): `POST /api/testimonials` (public, 60/min, quote 40–600 chars, consent required, `verified_member` = email exists in `users`) → status `pending` → Founder Portal **Marketing → Testimonials** (`/admin/testimonials`, approve / reject / feature / edit / delete) → `GET /api/testimonials` returns **approved only, never the email** → rendered by `TestimonialsBlock` in the homepage trust block and on `/customers`. Until the first approval, the site shows the honest empty state ("No published member stories yet — we only publish real ones…"). |
| D3.2 `/customers` | New `pages/CustomersPage.js`: "Real families. Real words. Nothing invented.", honest empty state, `ProductPreview` (real screenshots as the "artifact"), founder video + `FounderCard`, **Share your story** form (`TestimonialForm`), Start Now + badges. Linked from footer, trust block, About mobile menu, sitemap. |
| D3.3 founder | `FounderCard` (photo or initials, name, title, LinkedIn if set, "Read his story" → /about) in the trust block and /customers; Organization JSON-LD on `/` now has `founder` Person (+ `sameAs` LinkedIn when set); `/about` emits a Person JSON-LD (image, sameAs). **User still must upload the real photo + LinkedIn URL in Founder Portal → Site Content** — preview DB currently holds a purple test image. |
| D3.4 transactional | `TrustBadges` ("No card needed to explore · Cancel anytime · Payments secured by Stripe · Export everything, anytime") in the trust block, `/pricing` (subhead now "Explore first with no card…"), `/start`, `/customers`. Trust item "Try it before you pay" now says "no credit card needed". No guarantee text anywhere (by decision). |
| D3.5 recency | `public/changelog.json` (real dated entries; "Foundation 2024–Aug 2026" bucket has no fake dates) → `pages/ChangelogPage.js` (`/changelog`) and `LastUpdated` line in the trust block ("Last product update: September 16, 2026 · See what's new"). **Append to `changelog.json` whenever something ships.** |
| Trust item copy | "Built by a 24-year veteran…" card replaced by FounderCard; new 4th item "Built in Arlington, Virginia since 2024" (real address/phone/registered LLC). |

New test IDs: `founder-card{s}`, `founder-photo{s}` / `founder-initials{s}`, `founder-name{s}`, `founder-about-link{s}`, `founder-linkedin{s}`, `live-stats{s}`, `live-stat-{families|documents|messages|checklist_items|people_invited}{s}`, `testimonials-block{s}` / `testimonials-empty{s}`, `testimonial-card{s}`, `testimonials-customers-link{s}`, `trust-badges{s}`, `last-updated{s}`, `changelog-link{s}`, `landing-footer-customers-link{s}`, `landing-footer-changelog-link{s}`; `/customers`: `customers-page|h1|stories|empty|founder|founder-video|share|start-now`, `testimonial-form|name|location|role|since|quote|email|consent|submit|error|form-sent`; `/changelog`: `changelog-page|h1|entry-N|start-now`; `MarketingNav`: `marketing-nav{s}|-logo|-start|-sign-in`; admin: `testimonials-tab`, `testimonials-filter-{pending|approved|rejected|all}`, `testimonial-row-{id}`, `testimonial-{approve|reject|feature|save|delete|edit-name|edit-quote|status}-{id}`, `testimonials-empty`, `live-stats-preview`, `live-stats-mode-{auto|on|off}`. Removed: `trust-founder-link{s}`.

Collection `testimonials`: `{id, name, display_name, location, role(benefactor|beneficiary|hospice_family|military|other), quote, email(private), member_since, verified_member, consent, status(pending|approved|rejected), featured, user_agent, created_at, approved_at, reviewed_by}`. Indexes: `id` unique, `(status, approved_at)`.

Testing rule: any testimonial created during tests **must be deleted** afterwards and `show_live_stats` restored to `auto` (iteration_65 did both).

---

## 1b. Conversion-clarity pass (D2) — what shipped (same day, later)

| Audit item | Fix |
|-----------|-----|
| D2.1 sign-in form in hero / no product UI | Root `/` already marketing-only (D1). Hero now ends with a **real dashboard screenshot** (`components/landing/HeroShot.js`): browser frame ≥640px, phone frame <640px, bottom fade mask. |
| D2.2 CTA hierarchy | `components/landing/HeroCtas.js` shared by `/` and `/login` (desktop + mobile heroes): **primary "Start Now" → `/start`**, secondary "See it in action" → `#preview`, micro-line "Explore first — no credit card needed. Or take the 60-second readiness quiz · view pricing". Hero "Sign In" button removed (nav keeps it). Nav button text "Get Started" → "Start Now"; `/login` nav "Open Account" (→/signup) replaced by "Start Now" (→/start). |
| D2.3 long, text-heavy | 8 feature cards now a **2-column grid** (arrow shaft/head removed); Five Steps is a two-column `StepsShowcase` with a **sticky phone screenshot that changes per step** (IntersectionObserver, desktop only; map contacts/dashboard/vault/checklist/dashboard). Product preview default tab = vault (hero already shows dashboard). |
| D2.4 mobile nav | `components/landing/MobileNav.js` hamburger (<md) with `MARKETING_LINKS` (Features, Readiness Quiz, Security, How It Works, Pricing, About) + Start Now / Sign In. `/login` adds Founder. `MARKETING_LINKS` is now the single source for the desktop nav on both pages. |
| D2.5 `user-scalable=no` | `public/index.html` viewport → `width=device-width, initial-scale=1, viewport-fit=cover`. `App.js` re-applies the locked viewport **only** when `isNative || isPWA()`. iOS focus-zoom is already prevented by the global `input { font-size: max(16px, …) }` rules in `index.css`. |
| D2.B scope honesty | `scope-block{suffix}` in the problem section: "Built for … No estate attorney on retainer required" / "Probably not for … family office or full-time advisor". |
| `/features`, `/customers` unlinked | Those pages do not exist; nothing links to them and they are not in the sitemap. Create real pages before adding links. |

New test IDs: `hero-ctas{s}`, `hero-start-now{s}`, `hero-no-card{s}`, `hero-quiz-link{s}`, `hero-pricing-link{s}`, `hero-product-shot-home`, `mobile-menu-toggle{s}`, `mobile-menu{s}`, `mobile-menu-link-{slug}{s}`, `mobile-menu-start{s}`, `mobile-menu-sign-in{s}`, `login-nav-start-now`, `scope-block{s}`, `step-{1..5}{s}`, `steps-phone{s}` (`data-active-shot`). Removed: `home-get-started-hero`, `home-sign-in-hero`, `nav-founder-btn-mobile`.

---

## 1. User decisions taken today (do not re-ask)

1. **Hero H1** → `Get your family’s affairs in order — in one secure place.` with `Every American Family. Ready.` demoted to a small gold eyebrow line. (Option a, approved.)
2. **Root `/`** → marketing homepage for new visitors; anyone with a saved token / PWA / native app still lands on `/login`. `/login` itself unchanged. (Option a, approved.)
3. **Jargon** → every feature card leads with a plain-language title; trademarked product name kept as a small sub-label (e.g. *Estate Guardian™ AI*). Acronym chips (MM, SDV, EGA, IAC, CCP, ECT, DAV, FFN) removed from marketing pages only. **In-app UI keeps its existing names.** (Option a, approved.)
4. User rejected the React-rendered "sample family" mock and asked for **real screenshots from the live site using account `petemitchell` / `Demo1234!!!`**. Done; that account is a demo persona ("Pete Mitchell", documents labelled "Fictional Sample").
5. User then asked for **phone-sized screenshots** and a **Readiness Quiz**, then **quiz tracking in the Founder Portal** and **quiz email follow-up**. All done.

---

## 2. File map — everything touched today

### Frontend (React, `/app/frontend/src`)
| File | Change |
|------|--------|
| `App.js` | Added `RootRoute` (line ~124): `isNative || isPWA() || localStorage.carryon_token` → `<Navigate to="/login">`, else `<HomePage/>`. `Route path="/"` now uses it. Imports `isPWA` from `utils/pwaDetect`. |
| `components/landing/heroCopy.js` | **NEW.** Single source of truth for hero copy: `HERO.eyebrow / h1a / h1b / sub / badges`. Used by HomePage + LoginPage (desktop & mobile heroes). |
| `components/landing/ProductPreview.js` | **NEW.** Section `#preview`. Tabs dashboard / vault / contacts / checklist. `DesktopFrame` (`hidden md:block`, browser chrome, 16:10) shows `/screenshots/{id}.webp`; `PhoneFrame` (`md:hidden`, 390:664) shows `/screenshots/m-{id}.webp`. Caption per tab + honesty footnote. |
| `components/landing/ReadinessQuiz.js` | **NEW.** Section `#quiz`. 8 questions × options Yes=2 / Partly=1 / No=0. Stages intro → quiz → result. Result = SVG score ring, tier, up to 3 fixes from weakest answers, `EmailCapture` form, CTA → `/start?utm_source=readiness_quiz&utm_medium=homepage&utm_content=score_NN` (also `sessionStorage.carryon_quiz_score`). On reaching result it POSTs `/api/quiz/results` and keeps `resultId` for the email call. |
| `components/landing/LandingContent.js` | Rewritten copy (see §3). Renders `<ProductPreview/>` first, then `beforeAbout` slot (video), problem section, `<ReadinessQuiz/>`, outcomes grid, 8 feature cards, platform features, 5 steps, security, **new trust block**, FAQ (now 6), hospice, final CTA, footer. |
| `pages/HomePage.js` | Hero uses `HERO`; eyebrow added; H1 `textWrap: balance`; badges from `HERO.badges`; "See How It Works" → `#preview`; nav gained `Readiness Quiz → #quiz`; Helmet title/meta + JSON-LD rewritten in plain language. Removed unused `isIOS/isAndroid` import. |
| `pages/LoginPage.js` | Same hero changes for desktop (`hero-h1-desktop`) and mobile (`hero-h1-mobile`) blocks; nav gained `Readiness Quiz`; Helmet title `Sign In - CarryOn …`, canonical `https://carryon.us/login`. Login form/OTP/forgot flows untouched. |
| `pages/GetStartedPage.js` | Step-4 subtext: removed unverifiable "Join families across the country…" claim → "Get your affairs in order in one secure place. Start your exploration period today — cancel anytime." |
| `pages/ChecklistPage.js` | `renderItemCard`: outer row `flex-wrap sm:flex-nowrap`; actions container `w-full sm:w-auto justify-end pl-12 sm:pl-0 mt-2 sm:mt-0`. Fixes the real mobile bug where badge + 5 icons squeezed the title to one word per line. |
| `components/admin/QuizAnalyticsTab.js` | **NEW.** Founder Portal tab: 5 metrics, "Where families feel least prepared" stacked bars (sorted by gap %), score histogram, tiers, by source + device, Leads table with client-side CSV export, Recent results table. |
| `pages/AdminPage.js` | Registered tab `{ key: 'quiz', label: 'Readiness Quiz', icon: CheckSquare, path: '/admin/quiz' }` in the **Marketing** section, path map `/admin/quiz → quiz`, render `<QuizAnalyticsTab/>`. |
| `public/screenshots/*.webp` | **NEW assets** — 4 desktop (2160×1350) + 4 mobile (780×1328). See §4. |

### Backend (FastAPI, `/app/backend`)
| File | Change |
|------|--------|
| `routes/quiz.py` | **NEW.** See §5 for endpoints and schema. |
| `server.py` | `from routes.quiz import router as quiz_router`; `api_router.include_router(quiz_router)`; indexes on `readiness_quiz_results` (`id` unique, `created_at`, `email`). |
| `middleware.py` | Rate limiter: any path starting `/api/quiz/` is in the **moderate** tier (60 req/min/IP). |
| `tests/test_readiness_quiz.py` | Added by the testing agent (11 pytest cases, all pass). |

### Tooling
| File | Purpose |
|------|---------|
| `/app/scripts/capture_product_screenshots.py` | Logs into the **production** site, captures the four product screens, converts to WebP. See §4. |

---

## 3. Marketing copy decisions (LandingContent.js) — audit item → what shipped

| Audit item | Old | New |
|-----------|-----|-----|
| D1.1 hook | H1 "Every American Family. Ready." | Eyebrow "EVERY AMERICAN FAMILY. READY." + H1 "Get your family’s affairs in order — in one secure place." |
| D1.1 sign-in form competes | `/` → login page (form on right half) | `/` → HomePage; login only at `/login` |
| D1.2 pain match | "More Than Estate Planning. Total Family Preparedness." | "Nobody knows where anything is. **Until now.**" + drawers/will/passwords copy |
| D1.3 JTBD | emotional/social not surfaced | Outcomes grid: *Stop carrying it in your head* / *Be the one who made it easy* / *No awkward conversations required* |
| D1.4 trust gap | nothing (no social proof exists) | Trust block **"We’re new. Here’s what we can promise."** — founder (24-yr veteran, link `/about`), nobody can read your docs, export/cancel anytime, exploration period. Explicit line: no invented testimonials. FAQ #2 *"CarryOn is new. How do I know it will be around?"* |
| D1.5 visualization | flag image + founder video only | Real screenshots (desktop + phone) in `#preview`; "See How It Works" scrolls there |
| D1.6 audience language | 8 acronyms, "eight pillars", "benefactor", "per-estate encryption", "readiness infrastructure", "digital family preparedness platform" | Plain titles: *Messages for the moments you’ll miss* (Milestone Messages), *Every important document, in one place* (Secure Document Vault), *A second set of eyes on your paperwork* (Estate Guardian™ AI), *What to do first* (Immediate Action Checklist), *Emergency plans* (Contingency Protocols), *Private family messaging* (Estate Communications Tool), *Passwords & accounts* (Digital Access Vault), *Who to notify* (Family & Friends Notification). Hero badges: "AES-256 encrypted / Your own encryption key / Two-step sign-in". Headline "Everything your family will need. In one place." End tile "It’s handled." Final CTA "Start getting your affairs in order today." |

Forbidden phrases now (grep before shipping copy): `Eight Pillars`, `readiness infrastructure`, `Per-Estate Keys`, `per-estate encryption`, `digital family preparedness platform`, `Total Family Preparedness`, `Join the families`, standalone chips `SDV|EGA|IAC|CCP|ECT|DAV|FFN|MM`.

---

## 4. Real product screenshots — how they were made, how to redo them

**Source:** the LIVE production site `https://www.carryon.us` (API `https://carryon-api-kacr.onrender.com`), account **`petemitchell` / `Demo1234!!!`** (benefactor + beneficiary, direct login, no OTP). This account does **not** exist in the preview DB — only in production.

**Script:** `/app/scripts/capture_product_screenshots.py`
```bash
# desktop 1440x900 @2x  -> /app/frontend/public/screenshots/{dashboard,vault,contacts,checklist}.webp (2160x1350)
SHOT_USER=petemitchell SHOT_PASS='Demo1234!!!' /opt/plugins-venv/bin/python /app/scripts/capture_product_screenshots.py
# iPhone 14 viewport 390x664 @2x -> m-{...}.webp (780x1328)
SHOT_MODE=mobile SHOT_USER=petemitchell SHOT_PASS='Demo1234!!!' /opt/plugins-venv/bin/python /app/scripts/capture_product_screenshots.py
```
- Must use `/opt/plugins-venv/bin/python` (has Playwright); system `python3` does not. Browser: `/usr/bin/chromium`.
- Pages: `/dashboard`, `/vault`, `/beneficiaries` (tab "Who to call first"), `/checklist` (auto-expands "Critical – Do Immediately").
- Before shooting it hides per-account nudges by test ID: `[data-testid="onboarding-wizard"]`, `[data-testid="push-notification-prompt"]`, `[data-testid^="lock-banner-"]`. Nothing else is altered.
- It injects the same responsive CSS as the ChecklistPage fix so the mobile checklist shot matches the shipped UI (production still runs the old CSS until redeployed).
- Milestone Messages page was deliberately **not** captured: the account's messages are titled "Test Text Milestone Message" — tidy the data before adding a 5th tab.
- Honesty footnote on the site: *"Actual screenshots of CarryOn, taken from a live demonstration account. Nothing mocked up."*

---

## 5. Readiness Quiz — data model & API

**Collection:** `readiness_quiz_results`
```json
{ "id": "uuid", "answers": [0|1|2 ×8], "score": 0-100, "tier": "searching|gaps|ahead",
  "utm": {"utm_source": "...", ...}, "page": "/", "device_type": "mobile|desktop|tablet",
  "email": null | "lower@case", "email_sent": false, "email_requested_at": "iso", "created_at": "iso" }
```
Scoring: `round(sum(answers) / 16 * 100)`. Tiers: `>=75 ahead`, `>=40 gaps`, else `searching`. Fixes: the three lowest-scoring questions (ties by index) → `QUESTIONS[i].fix`.

**Endpoints** (`/app/backend/routes/quiz.py`)
| Method & path | Auth | Notes |
|---|---|---|
| `POST /api/quiz/results` | public, 60/min/IP | body `{answers[8], utm{}, page}` → `{id, score, tier, tier_title, fixes[]}`; 400 if a value ∉ {0,1,2}; 422 on shape errors |
| `POST /api/quiz/results/{id}/email` | public, 60/min/IP | body `{email}`; validates via `services.email.is_valid_email` (blocks test domains); sends branded HTML via Resend (`send_email`); stores `email`, `email_sent`; 400 invalid, 404 unknown id, 502 if Resend fails |
| `GET /api/admin/quiz/analytics` | `require_admin` + marketing scope | `{total, last_7d, avg_score, emails_captured, emails_sent, capture_rate, by_tier, by_device, histogram[5], questions[8 sorted by gap_pct desc], by_source, recent[≤20], leads[≤500]}`; `{total:0,...}` when empty |

`QUESTIONS` in `quiz.py` (labels + fix strings) **mirrors** `QUESTIONS` in `ReadinessQuiz.js` by index — keep both in sync if you edit a question.

Email template lives in `build_quiz_email()`; CTA links to `https://carryon.us/start?utm_source=readiness_quiz&utm_medium=email&utm_content=score_NN`. Footer includes the opt-out line and company address.

**Frontend test IDs**: `readiness-quiz{-home}`, `quiz-intro`, `quiz-start-btn`, `quiz-question`, `quiz-progress-label`, `quiz-question-text`, `quiz-option-{2|1|0}`, `quiz-back-btn`, `quiz-result`, `quiz-score-ring`, `quiz-score-value`, `quiz-result-title`, `quiz-fixes`, `quiz-email-form|input|submit|error|sent`, `quiz-start-carryon-btn`, `quiz-retake-btn`. Admin: `quiz-analytics-tab`, `quiz-gaps-panel`, `quiz-gap-row-{0..7}`, `quiz-leads-panel`, `quiz-leads-export`, `quiz-recent-panel`, `quiz-analytics-refresh`, `quiz-analytics-empty`.

**Live-email rule for testers:** Resend is LIVE. Only ever send test quiz emails to `info@carryon.us` (founder's own inbox), once per flow.

---

## 6. Other test IDs added today (marketing)
`hero-eyebrow-home|desktop|mobile`, `hero-h1-home|desktop|mobile`, `scroll-explore-home|desktop|mobile` (href `#preview`), `product-preview{-home}`, `preview-tab-{dashboard|vault|contacts|checklist}{-home}`, `preview-desktop-frame{-home}`, `preview-phone-frame{-home}`, `preview-panel-{id}` (desktop img) / `preview-panel-{id}-mobile` (phone img), `preview-url{-home}`, `preview-caption{-home}`, `problem-heading{-home}`, `outcomes-grid{-home}`, `features-heading{-home}`, `pillar-card-{01..08}{-home}`, `complete-preparedness-tile{-home}`, `trust-heading{-home}`, `trust-grid{-home}`, `trust-founder-link{-home}`, `faq-question-{0..5}`, `faq-answer-{i}`. Suffix `-home` is used on `/` (HomePage); no suffix on `/login`.

---

## 7. Gotchas discovered today (read before touching the build)
1. **yarn.lock** in git lacked `react-helmet-async` (added by an earlier session with `yarn add` but never committed). I regenerated it with `yarn install --ignore-engines --prefer-offline` (no add/remove). Housekeeping check #5 passes with the new hash. Do **not** `git checkout frontend/yarn.lock` — that reintroduces the mismatch.
2. Running `yarn install` while the CRA dev server is up breaks module resolution (`Can't resolve babel-loader`). Fix: `sudo supervisorctl restart frontend`.
3. The screenshot tool used by agents saves JPEG q40 into `/root/.emergent/automation_output/<ts>/` — not usable as site assets. Use the capture script instead.
4. Never put JSON-LD `<script>` inside `<Helmet>` (crashes) — render via `dangerouslySetInnerHTML` in the page body (existing convention).
5. Production backend on Render is **stale** (pre-dates founder-photo feature and everything today). Until the user redeploys both frontend and `carryon-api`, none of today's work is live on carryon.us.
6. Housekeeping WARN #50 (38 sub-11px fonts) is pre-existing; don't add `text-[11px]`/`text-[10px]` in new marketing code.
7. `frontend/android/gradle/wrapper/gradle-wrapper.jar` shows as untracked — pre-existing, not from today.

---

## 8. Verification artifacts
- `/app/test_reports/iteration_61.json` — copy overhaul, root route, acronym purge, trust/FAQ, SEO tags (12/12 PASS)
- `/app/test_reports/iteration_62.json` — desktop/phone screenshot switching, quiz scoring/flow/CTA, nav link, checklist mobile layout (all PASS)
- `/app/test_reports/iteration_63.json` — quiz tracking API, email validation/send, admin analytics + tab (11 backend pytest + frontend PASS)
- `/app/backend/tests/test_readiness_quiz.py` — regression tests for the quiz API
- `bash /app/housekeeping.sh` → 65/65 PASS (WARN #50 pre-existing)

## 9. What's next (user-visible options offered)
- Real testimonials (user must supply quotes/photos) → drop into the trust block / `/customers`
- 5th screenshot tab for Milestone Messages once the demo account has a polished message
- Deploy: Render backend + frontend so carryon.us shows today's work; then run the capture script again for pixel-exact shots of the shipped checklist fix
- Quiz: weekly digest of quiz stats to the founder; A/B the CTA copy on the result screen
