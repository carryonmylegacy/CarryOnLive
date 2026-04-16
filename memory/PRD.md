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
- 21 structured rules across categories: Billing Cycle, Family Plan, Trial & Grace, Beneficiary Billing, Beta Policy, Verification, Founders Circle, FC Installment Discounts
- Editable values: discount percentages, trial duration, grace period, FC campaign toggle, FC installment discounts

### Phase 2: Founders Circle Backend (NEXT)
- Data model: `founders_circle_subscriptions` collection
- Fields: user_id, estate_id, tier, payment_schedule (1/3/6/12), lifetime_base_price, discount_percent, amount_per_payment, payments_made, payments_total, stripe_subscription_id, status (active/completed/failed/honored), created_at
- Stripe integration: one-time checkout for 1-pay, scheduled subscriptions for 3/6/12-pay
- Lifetime pricing per tier (adjustable in admin Subs tab)
- Upgrade policy: pay-the-delta with same installment options

### Phase 3: Founders Circle Paywall Page
- Landing page with value proposition bullets
- "Example: 45yo Premium subscriber paying monthly = ~$11,995 over 40 years. FC pay-in-full = $424."
- Tier cards with 4 installment options each
- "Beneficiaries free forever" callout
- Linked from Subscription page (toggle-controlled)

### Phase 4: Integration Points
- Subscription page: FC link (toggle-aware), member status display
- Beneficiary messaging: "Your benefactor [Name] is a Founders Circle member..."
- Post-transition: estate retains FC tier, trustee can add beneficiaries who also get free access

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

## Upcoming Tasks
- (P0) Founders Circle Phases 2-4
- (P0) Google Play Store Launch
- (P1) iOS Share Extension
- (P1) iOS Live Updates (Capgo)
- (P2) CFP Getting Started integration
- (P2) Readiness Scoring Policy Page
- (P3) ECT Security Comparison Landing Page
