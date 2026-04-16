# CarryOn - Family Preparedness Platform PRD

## Original Problem Statement
Comprehensive family preparedness platform with estate planning, secure document vault, milestone messages, estate chat, connected care protocol, financial portal, and subscription management.

## Current Architecture
- **Frontend**: React (components, pages, contexts)
- **Backend**: FastAPI (routes, services, models)
- **Database**: MongoDB
- **Payments**: Stripe + Apple IAP (pending)
- **AI**: xAI Grok via Emergent LLM Key
- **Email**: Resend
- **Calendar**: LeadConnector iframe embed

## What's Been Implemented

### Core Features (Complete)
- PWA with push notifications
- Estate Chat (ECT) with iMessage-like UI, emoji reactions (700+), voice messages, image sharing
- Connected Care Protocol (CCP) with Tap-to-Create Wizard
- Milestone Messages
- Secure Document Vault (SDV)
- Financial Portal
- Family Plan with discount stacking
- Multi-tier subscription system (Premium, Standard, Base, New Adult, Military/1R, Hospice, Veteran, Enterprise)
- Admin portal with founder, operations, finance, compliance, marketing, platform scopes
- /speak-with-us marketing page with LeadConnector calendar

### Session Work (Apr 15-16, 2026)
- **iOS Chat Fixes**: Preview guard (300ms), keyboard dismiss on long-press, scroll-to-bottom on new messages, smart auto-scroll (near-bottom check), voice player touch fix, voice send scroll, ratchet-free scroll (scrollHeight monitor for 3s)
- **Input Bar**: Transparent banner (background: var(--bg)), overflow:hidden cursor containment, light mode theme variables (--ect-btn-bg, --ect-input-bg, etc.)
- **Pin Fix**: is_estate_owner() now allows admin role users
- **Keyboard Dismiss**: Removed global touchend double-tap prevention handler, replaced with CSS touch-action: manipulation
- **Platform Rules Tab**: New admin Finance tab showing all business rules (21 rules across 8 categories). Editable by founder only, read-only for all other admin roles. Visible in all admin portals.
- **Other Fixes**: Book a Demo button on /speak-with-us, login jitter fix (flagOpacity ref), beta trial banner hide, dock default sync, BeneficiaryHubPage text line break

## Founders Circle Lifetime Subscription (In Progress)

### Phase 1: Platform Rules Tab (COMPLETE)
- Backend: `/api/admin/platform-rules` GET/PUT endpoints
- Frontend: `PlatformRulesTab` component in Finance section
- 21 structured rules across categories
- Editable by founder, read-only for all other admin roles

### Phase 2: Founders Circle Backend (COMPLETE)
- `/api/founders-circle/plans` — public endpoint returning FC pricing + availability
- `/api/founders-circle/checkout` — Stripe checkout (one-time for 1-pay, recurring for installments)
- `/api/founders-circle/status` — user's FC subscriptions
- `/api/founders-circle/checkout-status/{session_id}` — payment confirmation + activation
- `/api/admin/founders-circle/pricing` — update lifetime prices (founder only)
- `/api/admin/founders-circle/subscriptions` — view all FC subs (admin)
- `founders_circle` MongoDB collection with full tracking
- Auto-grants `free_access` override to estate beneficiaries on FC activation

### Phase 3: Founders Circle Paywall Page (COMPLETE)
- `/founders-circle` route with landing page
- Hero with "FOUNDING MEMBER — LIMITED TIME" badge
- 4 value proposition bullets
- Savings example (45yo Premium: $11,995 over 40 years vs $424 FC)
- Estate selector for multi-estate users
- Payment schedule selector (1/3/6/12 payments)
- 6 tier cards with dynamic pricing from admin settings
- Stripe checkout integration

### Phase 4: Integration Points (COMPLETE)
- Subscription page: FC CTA link (toggle-aware, hidden when campaign off or user already has FC)
- Subscription page: FC member status banner showing tier, payment progress, estate
- Subscription page: FC checkout redirect handling
- Beneficiary messaging in SubscriptionManagement: "Your benefactor was gracious and forward-thinking enough to become a Founders Circle member..."

### Apple IAP Annotation (Future)
Product IDs needed:
- carryon_fc_premium_lifetime ($424)
- carryon_fc_standard_lifetime ($339)
- carryon_fc_base_lifetime ($169)
- carryon_fc_new_adult_lifetime ($67)
- carryon_fc_military_lifetime ($152)
- carryon_fc_veteran_lifetime ($152)
Apple IAP supports one-time purchase only — installments are Stripe-only.
In-app note: "More payment options available on carryon.us"

### Key Business Rules
- FC campaign: toggle on/off, time-limited (~Year 1)
- Beneficiaries free forever: ALL FC payment schedules, current + future, per estate
- Upgrade: pay delta during campaign, same installment/discount options
- Post-campaign: no new FC purchases, existing members keep lifetime tier as floor
- Installment failure: 30-day grace → clean cut, revert to monthly
- Transition during installments: honored in full (gesture of kindness)
- Scope: per estate, not per user
- 1-pay: 15% off, 3-pay: 10% off, 6-pay: 5% off, 12-pay: 0% off

## Blocked Items
- Apple IAP: awaiting Apple "Paid Applications Agreement"
- Twilio SMS: awaiting A2P 10DLC campaign approval

## iOS Chat Keyboard — CRITICAL DO NOT TOUCH
See detailed V11 documentation in previous PRD version. Key points:
- position:fixed inset:0 overflow:hidden — ZERO JS viewport manipulation
- Input bar container MUST have: background: var(--bg), borderTop: 1px solid var(--bg), paddingBottom: 4px (or cursor breaks)
- overflow: hidden on textarea parent div clips iOS cursor rendering
- previewGuardRef (300ms) blocks phantom touches after image preview close
- Keyboard auto-dismisses via document.activeElement.blur() when long-press menu opens

## Recent Fixes (Apr 16, 2026)
- **ECTSecurityIntro Centering**: Tightened internal spacing, content-sized card with `my-auto` centering + `overflow-y-auto` fallback. Fits all iPhones.
- **CCPWelcomeWalkthrough Centering**: Removed `flex-1` that stretched card full-height. Content-sized card with `my-auto` centering. Inline title/description tiles. Increased outer padding to clear header (64px) and dock (84px). All 3 steps fit centered on all iPhone sizes.
- **CCP Wizard Overhaul (DONE)**: Complete rewrite of the plan creation wizard:
  - Step 1: Household (who needs special consideration)
  - Step 2: Single-select disaster type (one plan per disaster, 17 options)
  - Step 3: Location + disaster-specific follow-up questions (tailored per disaster type)
  - Step 4: AI generates draft plan → Review with "Draft Plan — Generated by CCP AI" banner
  - Removed generic "Stay or Leave" step — replaced by disaster-specific intelligence
  - AI now biases toward ECT for communication, SDV for documents
  - 17 disaster-specific templates with tailored questions (distant evacuation for hurricane/flood/tsunami/wildfire, local rendezvous for earthquake/tornado, immediate escape for house fire/home invasion, shelter-in-place for nuclear/pandemic/winter storm, etc.)
  - Backend updated with disaster-specific prompt context per disaster type
  - New files: `/app/frontend/src/components/ccp/disasterTemplates.js`

## Upcoming Tasks
- (P0) Google Play Store Launch
- (P1) iOS Share Extension
- (P1) iOS Live Updates (Capgo)
- (P2) Readiness Scoring Policy Page
