# Backend/Frontend Lineage Reconciliation — facts, evidence, plan (Sep 16, 2026)

> Read this before touching anything. Companion: `/app/memory/PUBLIC_CLAIMS_AUDIT.md` (§0).

## 1. What actually happened (verified, not guessed)

Repo: **github.com/carryonmylegacy/CarryOnLive** (PUBLIC). Render service `carryon-api-kacr` (Docker, `backend/Dockerfile`,
context `./backend`, branch `main`, **Auto-Deploy OFF**, deploys only via Deploy Hook fired by `.github/workflows/ci.yml`
SOC2 deploy-gate; health `/api/health`). Other Render services exist but are not the live API: `carryon-prebeta-web`,
`carryon-prebeta-api`, `carryon-api`, `carryon-backend`.

| Date (UTC) | Event | Evidence |
|---|---|---|
| 2026-04-12 | Two Emergent jobs fork from the same commit **5631da78** | `git merge-base main live-render` |
| Apr 12 → Sep 10 | **Job L ("live lineage")**: 2,274 commits, 1,049 files, +293k lines. Builds the real product (partner/manager portals, Founders Circle, Our Promise, Security page, SOC2 CI gate, Render migration, founder pricing rules, seniors tier, CFP/BEC/CES/TMA, referrals, share cards, estate binder, …). Last commit **ac0663c** "Signup Alert Meter shipped" 2026-09-10 03:34 | GitHub API `commits/ac0663c`, `/repos/.../activity` |
| 2026-09-10 03:36 | Job L pushes main → ac0663c; CI gate → Render Deploy Hook → **ac0663c is what runs on carryon-api-kacr today** | Render Events (user PDF), `/api/health` build `2026-04-28…pre-launch-refactor` |
| Apr 12 → Sep 16 | **Job F ("this fork")**: 50 commits, 92 files, +5.6k lines. Marketing/funnel only (Sep 15-16: `/start`, `/pricing`, homepage overhaul, quiz, testimonials, /customers, /changelog, founder card, screenshots) | `git diff --stat 5631da78 main` |
| **2026-09-15 03:07** | **Job F "Save to GitHub" FORCE-PUSHED main: ac0663c → ae69e77a**, orphaning Job L's 2,274 commits on GitHub. 14 normal pushes followed (last 442fbf83, Sep 16 04:56) | GitHub activity API: `force_push refs/heads/main ac0663c1 -> ae69e77a` |
| 2026-09-16 (D2/D3 stage) | Job F **Republish** → Emergent hosting now serves Job F's bundle `main.5280aea1.js` on BOTH `www.carryon.us` and `app.carryon.us`, pointing at the Render API | bundles contain "readiness quiz", "continuity escrow", "See inside CarryOn"; 0 hits for "Our Promise"/"Founders Circle" |

**Current production = Job F frontend (stale, marketing-only) + Job L backend (real product).**
- 17 endpoints the live frontend calls 404 on the live backend (quiz, testimonials, platform-stats, voice doc-lock, invitations/accept-existing).
- Job L's frontend (Our Promise, Security, Voices, Founders Circle, Speak With Us, Accessibility, Wind-Down Promise, partner/manager portals, QuickStart trial, share pages) is **not live anywhere**.
- GitHub `main` no longer contains the code that is running in production. **Any deploy from main today = 5-month regression.** (Mitigated only by Auto-Deploy OFF + CI gate.)
- Nothing in the Founder Portal is broken. Preview DB simply never had Job L's settings.

## 2. Where the code is right now
- `/app` (this workspace) — Job F, branch `main` (checked out).
- `/app` git branch **`live-render`** = ac0663c (Job L tip), fetched Sep 16 night from GitHub's dangling object (`git fetch origin <full-sha>` worked; tarball also worked). **Do not delete this branch.** If lost: `git fetch https://github.com/carryonmylegacy/CarryOnLive ac0663c1c6fdd407f0ff1dcfec15ce9014df2cf9` (works while GitHub keeps the object) or `https://api.github.com/repos/carryonmylegacy/CarryOnLive/tarball/ac0663c1c6fdd407f0ff1dcfec15ce9014df2cf9`.
- Job L layout: `backend/routes/{auth,beneficiaries,estate_chat,financial_portal,share_cards,subscriptions}/` are packages; `render.yaml`, `backend/Dockerfile`, `.github/workflows/ci.yml`, `housekeeping.sh` (its own), `memory/` (45 docs incl. DEPLOY.md, BRANCH_PROTECTION.md, SECURITY_POSTURE.md, MASTER_BRIEF_23_PHASES.md), `tests/`, `load_tests/`, `docs/`.
- Files changed on BOTH sides since 5631da78 (50): `.emergent/*`, `backend/{middleware,models,server,utils}.py`, `backend/routes/{admin/platform,admin_digest,auth,beneficiaries,digest,estate_chat,trial_reminders}.py`, `backend/routes/subscriptions/{checkout,plans}.py`, `backend/services/{email,invitation_sender}.py`, `frontend/package.json`, `frontend/public/{index.html,sitemap.xml,sw-push.js,version.json}`, `frontend/src/App.js`, `components/{SubscriptionPaywall,TrialBanner}.js`, `components/admin/SiteContentTab.js`, `components/landing/LandingContent.js`, `components/settings/SubscriptionManagement.js`, `pages/{About,Admin,Checklist,GetStarted,Home,Login,PrivacyPolicy,Signup,Terms,Trustee}Page.js`, `memory/{PRD,test_credentials}.md`, iOS public bundle files.
- Job F-only files worth porting: `backend/routes/{quiz,testimonials}.py`, platform-stats + founder-profile fields (`admin/platform.py`, `public/site-content`), `trial_duration_days` in plans response, UTM capture in signup; `frontend/src/pages/{Pricing,Start,Customers,Changelog}Page.js`, `components/landing/*` (HeroCtas, HeroShot, ProductPreview, ReadinessQuiz, StepsShowcase, FounderCard, LiveStats, TestimonialsBlock, TestimonialForm, TrustBadges, MarketingNav, MobileNav, heroCopy), `components/admin/{QuizAnalyticsTab,TestimonialsTab}.js`, `public/screenshots/*`, `public/changelog.json`, `scripts/capture_product_screenshots.py`, `backend/tests/test_readiness_quiz.py`, memory docs (SESSION_2026-09-16, PUBLIC_CLAIMS_AUDIT, this file).

## 3. Recommended path — Option A: Job L is the base; port Job F's marketing on top (USER APPROVAL REQUIRED)
Rationale: 2,274 vs 50 commits; Job L has the deploy pipeline, security hardening, SOC2 CI, Dockerfile, and the product features customers pay for. Job F's value is the Sep 15-16 marketing/funnel layer, which is small and portable.

### Phase 0 — Freeze (user, no code)
1. Do not use the other CarryOn Emergent chat (Job L) again — one job only from now on (this one). A "Save to GitHub" from Job L would force-push main back to ac0663c and orphan Job F's work (ping-pong).
2. No Render Manual Deploy, no CI-triggered deploy (don't push to main) until Phase 4.
3. No Republish until Phase 4.

### Phase 1 — Merge in the workspace (agent)
1. `git checkout -b reconcile main && git merge live-render` (true merge → both histories preserved on GitHub afterwards).
2. Conflict policy: **backend/, .github/, .emergent/, render.yaml, housekeeping.sh, tests/ → take `live-render`**, then re-add Job F backend additions as new code (quiz, testimonials, platform-stats, founder profile, trial_duration_days, UTM) adapted to Job L's package layout (`routes/auth/register.py`, `routes/admin/platform.py`, `routes/subscriptions/plans.py`). Check Job L for existing equivalents first (it has `referrals.py`, `funnel.py`, `changelog.py`, `public_content.py`, `platform_rules.py`, `admin/funnel_analytics.py`).
3. Frontend: take Job L's `App.js`, then add Job F routes (`/start`, `/pricing`, `/customers`, `/changelog`, `RootRoute` for `/`), keeping every Job L public route. `HomePage/LoginPage/AboutPage/LandingContent/Privacy/Terms/Signup/GetStarted` need side-by-side review — **user decides the public marketing set** (see §5).
4. `frontend/package.json`: union of deps; `yarn install` (Job L pins may differ; Job L uses `sw-push.js`/`version.json` SHELL_VERSION stamping — keep its mechanism).
5. Update BUILD_HASH; append `frontend/public/changelog.json`.

### Phase 2 — Make preview boot on the merged code
- Python: Job L Dockerfile is Python 3.12 (numpy 2.4.2). Preview python 3.11 is OK (numpy ≥3.11). `pip install -r backend/requirements.txt` (emergentintegrations extra-index).
- `.env` keys Job L expects (from Render env list + code): APPLE_SHARED_SECRET, AWS_*, CORS_ORIGINS, DB_NAME, DEMO_REVIEW_*, EMERGENT_LLM_KEY, ENCRYPTION_KEY, JWT_SECRET, MONGO_URL, RESEND_API_KEY, SENDER_EMAIL, STRIPE_API_KEY, TWILIO_*, VAPID_*, XAI_* (+ any new in Job L `config.py`). Preview already has most; add missing with preview-safe values. NEVER overwrite `.env` wholesale.
- Run Job L's `housekeeping.sh` and `backend/tests`; run testing_agent on: login/OTP, dashboard, vault upload/download, beneficiaries, messages, checklist, guardian, subscriptions/plans, paywall, and the ported marketing pages.

### Phase 3 — Mirror live config into preview DB (user asked for this)
- Public: `GET https://carryon-api-kacr.onrender.com/api/subscriptions/plans` → plans, beneficiary_plans, gates (tier_features), discounts, beta_mode → write into preview `subscription_settings` (`_id: global`) + `feature_gates`.
- Admin-only settings (platform_rules, trial policy, site-content, notification settings): ask the founder to export from Founder Portal (Job L may have an export) or paste JSON; or founder grants a temporary read-only admin session. Add a **drift check** script (`scripts/config_drift_check.py`) comparing preview vs live public config, wired into housekeeping.

### Phase 4 — Ship, in this order
1. User: **Save to GitHub → main (force)** from THIS job → main now contains Job L history + Job F merge (orphaned commits restored).
2. CI SOC2 gate runs → fires Render Deploy Hook → backend live. Verify `/api/health` build string changed, `/api/quiz/results` 200, `/api/subscriptions/plans` unchanged for prices/gates.
3. User: **Republish** frontend from this job → verify www/app.carryon.us bundle hash changed and calls succeed.
4. Retire Job L chat permanently. Record in `memory/BRANCH_PROTECTION.md`: enable GitHub branch protection "no force push" on main so this cannot recur silently.

## 4. Risks
- Merge conflicts in 50 files; Job L refactored auth/beneficiaries into packages → Job F's `auth.py` edits must be re-applied by hand.
- Job L may have newer versions of things Job F also built (referrals vs. funnel referral bonus; changelog route vs. changelog.json; public_content vs. site-content). Prefer Job L's, port only what's missing.
- Preview DB has Job F's collections (readiness_quiz_results, testimonials) — fine, additive.
- Production frontend during the gap still 404s on quiz/testimonials (already true today).

## 5. Open decisions for the user
1. Approve Option A (vs. any alternative).
2. Public marketing set: (a) Job F's `/`, `/pricing`, `/start`, `/customers`, `/changelog` stay as the public face and Job L's extra pages (Our Promise, Security, Voices, Founders Circle, Speak With Us, Accessibility, Wind-Down Promise, QuickStart) are added to nav/sitemap; or (b) Job L's public pages win and Job F's marketing is dropped/merged into them.
3. Keep or remove: "continuity escrow" (FAQ) — note Job L has a **Wind-Down Promise** page that may be the real, approved version of this promise; "24/7 platform support".
4. Which Emergent chat is Job L (so it can be retired) — the one used until Sep 10 ("Signup Alert Meter").

## 6. Handy commands
```bash
cd /app && git log --oneline -3 live-render            # Job L tip ac0663c
git diff --stat 5631da78 main | tail -1                # Job F delta (92 files)
git diff --name-only 5631da78 main | sort > /tmp/f; git diff --name-only 5631da78 live-render | sort > /tmp/l; comm -12 /tmp/f /tmp/l   # 50 overlaps
git show live-render:frontend/src/App.js | grep -o 'path="/[^"]*"' | sort -u   # Job L routes
curl -s https://carryon-api-kacr.onrender.com/api/health                        # live build string
curl -s "https://api.github.com/repos/carryonmylegacy/CarryOnLive/activity?per_page=15"   # push history (force_push visible)
```
