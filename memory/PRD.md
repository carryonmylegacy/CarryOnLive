# CarryOn - Estate Planning Application

## ZERO TOLERANCE: Perfect Code Every Push
**MANDATORY: Before EVERY push, run `bash /app/housekeeping.sh`. ALL 65 checks must PASS.**
**MANDATORY: After EVERY testing agent call, run `cd /app/backend && ruff format . && ruff check .` — testing agents create files with trailing whitespace that fail Vercel CI.**


---

## DO NOT TOUCH — ECT Chat View Transition Settling (iOS PWA)

**Priority: DOCUMENTED PERMANENT — DO NOT ATTEMPT TO FIX**

**Issue**: When tapping a channel to open a chat on iOS PWA, the entire chat view (header + message area + input bar) slides up then ratchets down into position before settling. The text input bar may also appear with a slight delay or flash into position separately.

**What was tried (April 3, 2026) — ALL FAILED, ZERO EFFECT:**

1. **Clearing CSS transitions** on `ect-root` in `openChannel()` — `r.style.transition = 'none'` before resetting transform/bottom. **No effect.**
2. **`visibility: hidden` + double-`requestAnimationFrame` reveal** — hide ect-root during DOM swap, reveal after browser completes layout+paint. **Made keyboard behavior WORSE — header jumped twice, input bar ratcheted.**
3. **`willChange: 'transform'`** on ect-root to force GPU compositing layer. **Made keyboard behavior WORSE (same as #2, applied together).**
4. **`window.scrollTo({ behavior: 'instant' })`** instead of `scrollTo(0,0)`. **Made keyboard behavior WORSE (same as #2/#3, applied together).**
5. **`animation: fadeIn 0.12s ease-out`** CSS opacity mask on messageArea container. **No effect.**
6. **`min-height: 0` (`min-h-0`)** on the messages scroll container to fix iOS flex sizing bug. **No effect.**
7. **CSS Grid** (`display: grid; grid-template-rows: auto 1fr auto auto`) instead of Flexbox on messageArea to force single-pass layout. **No effect.**
8. **Removing `window.scrollTo(0, 0)`** from `openChannel()` entirely. **No effect.**
9. **DOM persistence** — keeping both channelPanel and messageArea always in the DOM and toggling with CSS `display: none`/`flex` classes instead of React ternary swap. Eliminates DOM insertion/removal entirely. **No effect.**
10. **Fixed wrapper + absolute inner** — wrapping `ect-root` in a `position: fixed` parent and changing `ect-root` to `position: absolute`. Standard iOS developer workaround for fixed-element rendering bugs. **No effect.**

**Conclusion**: This is an iOS Safari rendering behavior with `position: fixed` containers that cannot be resolved through CSS, JavaScript, DOM strategy, or positioning changes made remotely. Every approach — from CSS transitions to GPU compositing to DOM mutation avoidance to positioning strategy changes — produced either zero effect or made the keyboard behavior worse. The settling animation is baked into how iOS Safari handles content changes inside fixed-position elements.

**Cost**: Thousands of tokens and multiple screen recordings were spent reaching this conclusion. **DO NOT re-attempt any of the above fixes or variations thereof.** Any future agent encountering this issue must read this section first and not repeat these approaches.

**The only approaches NOT tried** (and may warrant future investigation with physical device access):
- Native iOS WKWebView configuration flags
- Capacitor-level viewport management plugins
- Replacing `position: fixed` entirely with a different layout paradigm (e.g., full-page CSS Grid with no fixed positioning)

---
## Original Problem Statement
A full-stack estate planning application allowing benefactors to manage digital estates, beneficiaries, documents, and messages.

## Core Architecture
- **Frontend**: React (CRA) + Shadcn/UI + TailwindCSS + Capacitor (iOS/Android)
- **Backend**: FastAPI + MongoDB (motor async)
- **Auth**: JWT-based with optional OTP
- **Storage**: AWS S3 (presigned URLs)
- **Integrations**: xAI (Grok), Stripe, Apple IAP, AWS S3, Resend, Google Places, Capgo

## CRITICAL: User Deployment & Testing Workflow
**User deploys via GitHub -> Railway (backend) + Vercel (frontend), tests on carryon.us via iOS/PWA.**

---

## LOCKED-IN FEATURES - DO NOT REGRESS

### 1. Download Token System (MongoDB-backed)
- **Status**: FIXED (April 2, 2026)
- **Files**: `services/download_tokens.py`, `routes/downloads.py`
- **DO NOT**: Revert to in-memory `_tokens` dict

### 2. ECT Channel List
- **Status**: FIXED (April 2, 2026)
- **Fix**: `(c.get("last_message") or {}).get(...)`
- **Files**: `routes/estate_chat.py`
- **DO NOT**: Use `dict.get(key, {}).get(...)` pattern without `or {}` guard

### 3. ECT iOS Keyboard Handling
- **Status**: RE-FIXED (April 2, 2026) — `top:0; bottom:0` + visualViewport + window scroll listener + CSS transition
- **Approach**: `position:fixed; top:0; bottom:0` (no `100dvh`!) + visualViewport resize handler + `bottom` adjustment for keyboard + scroll compensation via transform + **window scroll listener** for iOS PWA scroll compensation + **CSS `transition: bottom 0.15s ease-out`** to smooth keyboard animation + **delayed scrollTo(0,0)** on input focus (150ms, 350ms)
- **DO NOT**: Use `height: 100dvh` — it's unreliable on iOS PWA standalone mode
- **DO NOT**: Apply viewport transforms when on the channel list (no active chat)
- **DO NOT**: Add `onMouseDown={e => e.preventDefault()}` on the mic button
- **DO NOT**: Use `setInterval` polling, `body { position: fixed }`, or `overflow: hidden` on body/html
- **DO NOT**: Use `setTimeout(sync, ...)` delayed re-syncs — they cause visible jitter as each fires at a different keyboard height

### 4. SDV Document Download via Download Proxy
- **Status**: RE-FIXED (April 2, 2026) — `platformDownload` utility
- **Files**: `VaultPage.js`, `downloadFile.js`, `downloads.py`
- **DO NOT**: Use direct `fetch()` + `navigator.share()` for downloads on iOS — user activation expires
- **DO NOT**: Revert to in-memory download tokens
- **DO NOT**: Remove the `promptToSave` overlay from `downloadFile.js`

### 5. MM Download — Always promptToSave (no double-tap)
- **Status**: RE-FIXED (April 2, 2026) — Removed initial `navigator.share()` attempt. Always goes straight to `promptToSave` overlay. Added **loading spinner** on download button during fetch.
- **Files**: `utils/downloadFile.js` (platformDownload -> always promptToSave), `MessagesPage.js` (downloadingId state + Loader2 spinner)
- **DO NOT**: Add back `navigator.share()` before `promptToSave` — user gesture always expires during async download

### 6. ECT Toast Import
- **Status**: FIXED (April 2, 2026) — Changed from `import { toast } from 'sonner'` to `import { toast } from '../utils/toast'`
- **Root cause**: sonner's toast calls are invisible when the app uses a custom toast system
- **Files**: `EstateChatPage.js` line 5
- **DO NOT**: Import toast from 'sonner' in pages — always use `../utils/toast`

### 7. ECT Swipe-to-Delete Channels
- **Status**: RE-FIXED (April 2, 2026) — backend permissions + CORS preflight fix + circle deletion enabled + **dismissal tracking**
- **Circle channels**: Swipe-to-delete works for ALL channel types. Circles are **dismissed per-user** (not hard-deleted) so they stay hidden even after `_ensure_circle()` auto-recreation. Non-circle channels are both dismissed AND hard-deleted.
- **New collection**: `estate_channel_dismissals` — `{user_id, channel_id, dismissed_at}` — unique index on `(user_id, channel_id)`
- **Un-dismiss**: When a new message is sent to a dismissed channel, all dismissals for that channel are cleared (channel reappears)
- **Header trash icon**: Only shows for group channels (`activeChannel.type === 'group'`)
- **DO NOT**: Re-add `if channel["type"] == "circle"` restriction on the backend
- **DO NOT**: Hard-delete circle channels (they auto-recreate, defeating the purpose)

### 8. ECT Channel List Refresh on Back-out - IMPLEMENTED
### 9. CCP Plan PDF Download - CONFIRMED WORKING
### 10. ECT Beneficiary Avatars - FIXED (April 3, 2026)
- **Root Cause**: Frontend had `.startsWith('http')` filter on `photo_url`, which excluded `data:image/...` base64 URLs stored by some users
- **Fix**: Removed `.startsWith('http')` check at 3 locations (contact modal, channel list, chat header) — now accepts any truthy `photo_url`
- **Files**: `EstateChatPage.js` lines ~904, ~1174, ~1219
- **DO NOT**: Re-add `startsWith('http')` filter — `resolve_photo_url()` already handles all URL types

### 11. Customizable Dock (Bottom Nav)
- **Status**: IMPLEMENTED (April 2, 2026)
- **Backend**: `routes/user_preferences.py` — GET/PUT `/api/user-preferences/dock`
- **Frontend**: `components/DockCustomizer.js` — UI for selecting/reordering 5 dock items
- **Integration**: `MobileNav.js` — exports `DOCK_REGISTRY`, fetches custom preferences, resolves items in `getBottomNav()`
- **Settings**: Added to both `SettingsPage.js` and `BeneficiarySettingsPage.js`
- **Roles**: All roles supported (benefactor, beneficiary, admin, operator)

### 12. ECT Bulk Delete Conversations
- **Status**: IMPLEMENTED (April 2, 2026)
- **Backend**: `routes/estate_chat.py` — `POST /api/estate-chat/channels/batch-delete` accepts `{channel_ids: [...]}`, returns `{deleted: [...], failed: [...]}`
- **Frontend**: `EstateChatPage.js` — Select mode toggle (CheckSquare2 icon) in header + long-press gesture (500ms hold), checkboxes on channels, Select All/Deselect All, bulk delete confirmation modal
- **Behavior**: Tap select button OR long-press any channel -> tap channels to select -> tap trash icon -> confirm -> done. Swipe-to-delete is disabled during select mode.
- **DO NOT**: Allow batch-delete of more than 50 channels in a single request

### 14. CCP Emergency Plan — Layout Fix & Beneficiary Assignment
- **Status**: IMPLEMENTED (April 3, 2026)
- **Layout**: Rendezvous Points and Resource Locations fields stacked vertically (Name on line 1, Address on line 2). `overflowX: hidden` on plan-edit container prevents horizontal slide.
- **Beneficiary Assignment**: New `assigned_beneficiary_ids` field on plans. `null` = all beneficiaries (default). Array of user IDs = specific beneficiaries only.
- **Backend filtering**: `GET /api/ccp/plans/{estate_id}` — benefactors see all plans; beneficiaries only see plans where `assigned_beneficiary_ids` is null OR contains their ID.
- **New endpoint**: `GET /api/ccp/members/{estate_id}` — returns estate members for the selector UI.
- **Status**: IMPLEMENTED (April 2, 2026)
- **Change**: Removed `<SubscriptionManagement />` from `SettingsPage.js` and `BeneficiarySettingsPage.js`
- **Reason**: Subscriptions have their own dedicated page; no need for duplication in Settings
- **DO NOT**: Re-add SubscriptionManagement to settings pages

### 15. Mobile/PWA Background Images — Gradient-Fade Banner (April 4, 2026)
- **Status**: FIXED
- **Issue**: Landscape background images (Pillars, Stepping Stones, Adult/Baby Hands) cropped poorly on mobile: `cover` was too zoomed in, `contain` was too small/meaningless.
- **Fix**: All three sections use a 280px tall banner at the top with `backgroundSize: 'cover'` and a `linear-gradient` fade to the section background color. Desktop retains full `inset-0` cover.
- **Sections**: Eight Pillars (`texture-pillars.jpg`), Five Steps (`texture-pathway.jpg`), Built for Real Families (`texture-families.jpg`)
- **File**: `components/landing/LandingContent.js`
- **DO NOT**: Revert to `contain` or full `inset-0 cover` on mobile for these landscape images

---

## Blocked Items
- **Apple IAP**: Waiting on Paid Applications Agreement
- **Twilio SMS OTP**: Waiting on A2P 10DLC approval

## Prioritized Backlog

### P0 — Username-Based Auth Migration (COMPLETED — April 7, 2026)
**Goal**: Switch from email-based login to username-based login. Email becomes non-unique (shared families). Beneficiaries join via invitation only.
- **23 touchpoints across 9 files** — validated by testing agent (17/17 backend, all frontend UI tests passed)
- **4 additional UX fixes** — validated by testing agent (14/14 backend, all frontend UI tests passed)
- **Housekeeping: 65/65 PASS, Ruff check PASS, Ruff format PASS**
- **Key changes**:
  - Username is the unique login identifier (not email)
  - Email is a non-unique communication channel (couples/families can share)
  - OTPs keyed by `user_id` instead of `email` (prevents collision)
  - Forgot-password uses username, not email
  - New `forgot-username` endpoint: sends username list to email
  - "Forgot Username?" link visible directly on all 3 login form variants
  - Shared-email error message is actionable with clear instructions
  - First-login username review modal for migrated users
  - Admin endpoint to proactively email all migrated users their new username
  - Signup is 3 steps: name → eligibility → credentials (with username)
  - Role selection removed (always benefactor)
  - Beneficiary self-signup removed (invitation-only)
  - Under-18 users blocked from direct signup with invitation message
  - Existing users auto-migrated with generated usernames
  - Login supports both username and email (username takes priority)

### P0 — Immediate Follow-On (Post-Auth Migration)
These items come from real user beta feedback and should be addressed immediately after the auth migration:

---

#### ITEM 1: DOB Auto-Slashes on Mobile
**Priority**: Low effort | **File**: `/app/frontend/src/components/DateMaskInput.js`

**Problem**: The `DateMaskInput` component auto-inserts `/` separators between MM, DD, and YYYY on desktop as the user types. On mobile web, the user has to manually type the `/` characters. The component uses `inputMode="numeric"` which shows a number pad on mobile — the auto-formatting logic in `handleChange()` (line 23) strips all non-digits and rebuilds with slashes, so theoretically it should work. The suspected issue is that some mobile browsers fire `onChange` differently with numeric keypads, or the `replace(/[^\d]/g, '')` strip may not execute before the display update.

**Current code** (line 23-30):
```javascript
const handleChange = (e) => {
  let raw = e.target.value.replace(/[^\d]/g, '');
  if (raw.length > 8) raw = raw.slice(0, 8);
  let formatted = '';
  if (raw.length > 0) formatted = raw.slice(0, 2);
  if (raw.length > 2) formatted += '/' + raw.slice(2, 4);
  if (raw.length > 4) formatted += '/' + raw.slice(4, 8);
  setDisplay(formatted);
```

**Implementation steps**:
1. Test on mobile Safari and Chrome to reproduce the issue
2. If `onChange` is the issue, add an `onInput` handler as fallback — mobile browsers sometimes fire `onInput` before `onChange`
3. Consider adding `pattern="[0-9]*"` attribute alongside `inputMode="numeric"` for broader iOS compatibility
4. Verify that the `maxLength={10}` (line 52) doesn't interfere with mobile input — the slash characters count toward maxLength, so `MM/DD/YYYY` = 10 chars which is correct
5. Test edge case: user pastes a date on mobile — ensure the strip+rebuild still works

**Test**: Type DOB on mobile browser without manually entering slashes — slashes should auto-appear after MM and DD.

---

#### ITEM 2: Beneficiary Photo Purpose Hint
**Priority**: Low effort | **File**: `/app/frontend/src/pages/BeneficiariesPage.js`

**Problem**: Users don't understand why they should add a photo of their beneficiary. The photo upload is accessible via the `AvatarCircle` component's `onUpload` prop (line 645-648) and a hidden file input (line 1222). There's no contextual explanation of why adding a photo matters.

**Implementation steps**:
1. In `BeneficiariesPage.js`, add a tooltip or small helper text near the avatar/photo area. Two options:
   - **Option A**: Add a subtle hint text below each avatar: `<p className="text-[10px] text-[var(--t5)] mt-1">Tap to add photo</p>` with a hover tooltip that reads: "Adding a photo helps your family instantly recognize each member across the platform — in chat, checklists, and emergency contacts."
   - **Option B**: Add a one-time dismissable info banner above the beneficiaries list (only shown if any beneficiary lacks a photo): "Tip: Add photos to help your family recognize each member across chat, checklists, and emergency access."
2. The `AvatarCircle` component (in `BeneficiariesPage.js` around line 637-650) already handles the upload trigger. The hint should be near this element.
3. Keep the hint subtle — use `text-[var(--t5)]` color, small font size (`text-[10px]` or `text-xs`), and don't make it feel like an error or required action.

**Test**: Visual check — hint text appears near beneficiary avatar. Tap avatar still triggers photo upload.

---

#### ITEM 3: Beneficiary Email Change Notifications
**Priority**: Medium effort | **Files**: Backend: `/app/backend/routes/beneficiaries.py`, Frontend: notification component

**Problem**: When a beneficiary updates their email or profile info (e.g., a college-aged child changes email), the benefactor has no way of knowing their records are now stale. There's no push notification or in-app alert.

**Current state**: Beneficiaries can update their profile via the beneficiary settings page. The backend endpoint for profile updates does NOT notify the benefactor.

**Implementation steps**:
1. **Backend** — In the beneficiary profile update endpoint (or wherever beneficiary email/profile changes are saved), add a post-update hook:
   - Find the estate(s) this beneficiary belongs to via `db.beneficiaries.find({"user_id": beneficiary_user_id})`
   - Find the benefactor (estate owner) via `db.estates.find_one({"id": estate_id})` → `owner_id`
   - Create an in-app notification record in a `notifications` collection:
     ```python
     {
       "id": str(uuid.uuid4()),
       "user_id": benefactor_user_id,  # who receives it
       "type": "beneficiary_profile_update",
       "title": "Contact Info Updated",
       "message": f"{beneficiary_name} updated their contact information. Review their profile to keep your records current.",
       "read": False,
       "created_at": datetime.now(timezone.utc).isoformat(),
       "link": f"/beneficiaries"  # link to beneficiaries page
     }
     ```
   - Optionally send an email to the benefactor using the existing `send_email` service:
     ```
     Subject: "[Name] updated their CarryOn profile"
     Body: "[Name] updated their contact information. Log in to review."
     ```
2. **Backend** — Add a GET `/api/notifications` endpoint to fetch unread notifications for the current user
3. **Backend** — Add a PUT `/api/notifications/{id}/read` endpoint to mark notifications as read
4. **Frontend** — Add a notification bell icon in the app header/nav that shows unread count and a dropdown of recent notifications. Clicking a notification marks it read and navigates to the relevant page.
5. **Track which fields changed**: Only trigger notification if email, phone, or address changed — not for minor profile tweaks like middle name.

**Test**: 
- Log in as beneficiary → change email in settings → log in as benefactor → see notification about the change.
- Verify notification links to the beneficiaries page.

---

#### ITEM 4: IAC "Accept" Button Tooltip
**Priority**: Low effort | **File**: `/app/frontend/src/pages/ChecklistPage.js`

**Problem**: The IAC (Immediate Action Checklist) has two types of "Accept" interactions, and users don't understand what they do:
1. **Default items** (line 661-670): Items seeded at signup have `is_default: true` and show Accept/Edit/Remove buttons. "Accept" sets `activation_status: 'accepted'` which means the user has reviewed and confirmed the item belongs in their plan.
2. **AI-suggested items** (line 648-656): AI-generated items have `ai_suggested: true` and show Accept (check) / Reject (X) buttons. "Accept" sets `ai_accepted: true`.

Users are confused about which items they can accept and what accepting means.

**Implementation steps**:
1. Add an info icon (`HelpCircle` from lucide-react) next to the "Accept" button for default items (line 663):
   ```jsx
   <div className="flex items-center gap-1">
     <button onClick={() => handleActivationAction(item.id, 'accepted')} ...>Accept</button>
     <div className="group relative">
       <HelpCircle className="w-3.5 h-3.5 text-[var(--t5)] cursor-help" />
       <div className="absolute bottom-full right-0 mb-1 w-48 p-2 rounded-lg bg-[#1a2744] border border-[var(--b)] text-xs text-[var(--t3)] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
         Accepting means you've reviewed this task and confirmed it's relevant to your family's plan.
       </div>
     </div>
   </div>
   ```
2. Add a similar tooltip for AI-suggested items' accept button (line 650):
   ```
   "This task was suggested based on your estate profile. Accept to keep it in your checklist, or reject to remove it."
   ```
3. Add `HelpCircle` to the lucide-react imports at line 7.

**Test**: Hover over the `?` icon next to Accept → tooltip appears with explanation. Tap Accept → item status updates correctly.

---

#### ITEM 5: IAC Collapsed/Prioritized View
**Priority**: Medium effort | **File**: `/app/frontend/src/pages/ChecklistPage.js`

**Problem**: The IAC list shows ALL items in a flat list sorted by `item.order` (line 588). When quick-start templates bulk-add many items, the list becomes overwhelming. Users want to see critical items first and progressively explore the rest.

**Current rendering** (line 587-588):
```jsx
<div className="space-y-2">
  {checklists.sort((a, b) => a.order - b.order).map((item) => {
```

**Categories** defined at line 20-29: legal, financial, insurance, property, medical, personal, government, general
**Priorities** defined at line 31-36: critical, high, medium, low

**Implementation steps**:
1. Add a `viewMode` state: `const [viewMode, setViewMode] = useState('priority');` — options: `'priority'` (default), `'category'`, `'all'`
2. Add a view toggle UI above the checklist items — small pill buttons: "By Priority" | "By Category" | "Show All"
3. **Priority view** (default):
   - Group items by priority level (critical, high, medium, low)
   - Show "Critical" group expanded by default (all items visible)
   - Show other groups collapsed with count: "High Priority (3 items)" — tap to expand/collapse
   - Use collapsible accordion pattern with `ChevronDown`/`ChevronRight` icons
   - Each group header shows the priority color bar and count
4. **Category view**:
   - Group items by category (legal, financial, insurance, etc.)
   - All groups collapsed by default with category icon + name + count
   - Tap to expand/collapse
5. **Show All view**:
   - Current flat list behavior (backward compatible)
6. **Accordion state**: `const [expandedGroups, setExpandedGroups] = useState(new Set(['critical']));` — critical expanded by default
7. Keep the existing item card rendering (line 593-710) — just wrap it in group containers
8. Persist the view preference in localStorage: `localStorage.getItem('iac_view_mode')`

**Test**:
- Default view shows "Critical" expanded, others collapsed with counts
- Tapping a collapsed group expands it, showing items
- Tapping again collapses it
- "Show All" reverts to flat list
- Switching between views preserves which groups are expanded

---

#### ITEM 6: Death Initiation UX Copy
**Priority**: Low effort | **File**: `/app/frontend/src/components/beneficiary/EmergencyAccessPanel.js`

**Problem**: The current entry point for a beneficiary to report a loved one's passing is labeled "Emergency Access Protocol" (line 80) with a button (line 203, `data-testid="emergency-request-btn"`). The phrasing is clinical and doesn't guide the user emotionally through what is a deeply personal action. The form fields (line 29-36) ask for `reason`, `relationship_to_benefactor`, `urgency`, `contact_phone`, `supporting_details`.

**Current UI labels**:
- Card title (line 78-80): "Emergency Access Protocol"
- The form asks for "reason" and "urgency" — which feel transactional

**Implementation steps**:
1. **Rename the card title** (line 78-80): Change from "Emergency Access Protocol" to "Report a Loved One's Passing"
2. **Add an empathetic subheading** below the title: "We're here to help your family through this transition. This process will verify your identity and begin unlocking the estate plan your loved one prepared for you."
3. **Rename form fields for empathy**:
   - `reason` label → "Please describe the circumstances" (instead of generic "reason")
   - `urgency` label → "How soon do you need access?" (instead of "urgency")
   - `relationship_to_benefactor` → "Your relationship to [benefactor name]"
4. **Add a guided explanation** before the submit button: "What happens next: CarryOn will verify your identity, notify the estate administrator, and begin the transition process. You'll receive updates at each step."
5. **Keep the existing `data-testid` attributes** unchanged for testing continuity
6. The backend endpoint (`/emergency-access/request` at line 59) does NOT change — only frontend copy

**Test**: Visual check — empathetic language visible. Submit flow still works (same API call, same form data).

---

#### ITEM 7: SEO Improvements
**Priority**: Medium effort | **Files**: `/app/frontend/public/index.html`, new files `robots.txt` and `sitemap.xml`, potentially `HomePage.js` and `LoginPage.js`

**Problem**: Searching "CarryOn" returns luggage results. Only "CarryOn Secure Estate Planning" returns the site. The site lacks Open Graph tags, Twitter cards, JSON-LD structured data, `robots.txt`, and `sitemap.xml`.

**Current SEO state** (in `index.html`):
- `<title>`: "CarryOn™ - Estate Planning & Legacy Management" (line 34)
- `<meta name="description">`: "CarryOn™ - Secure Estate Planning & Legacy Management" (line 12)
- No Open Graph tags
- No Twitter card tags
- No JSON-LD structured data
- No `robots.txt`
- No `sitemap.xml`

**Implementation steps**:
1. **`index.html`** — Add Open Graph tags after the existing meta description (line 12):
   ```html
   <meta property="og:type" content="website" />
   <meta property="og:title" content="CarryOn™ - Secure Family Preparedness & Estate Planning" />
   <meta property="og:description" content="Protect what matters most. CarryOn helps families organize estate plans, secure documents, and prepare for life's transitions — together." />
   <meta property="og:image" content="%PUBLIC_URL%/carryon-og-image.jpg" />
   <meta property="og:url" content="https://carryon.us" />
   <meta property="og:site_name" content="CarryOn" />
   <meta name="twitter:card" content="summary_large_image" />
   <meta name="twitter:title" content="CarryOn™ - Secure Family Preparedness" />
   <meta name="twitter:description" content="Organize your estate plan, secure your documents, and prepare your family — all in one place." />
   <meta name="twitter:image" content="%PUBLIC_URL%/carryon-og-image.jpg" />
   ```
2. **`index.html`** — Add JSON-LD structured data in a `<script type="application/ld+json">` block:
   ```json
   {
     "@context": "https://schema.org",
     "@type": "SoftwareApplication",
     "name": "CarryOn",
     "applicationCategory": "FinanceApplication",
     "description": "Secure family preparedness and estate planning platform",
     "url": "https://carryon.us",
     "operatingSystem": "Web, iOS, Android",
     "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
   }
   ```
3. **`index.html`** — Update the `<title>` to include more searchable keywords:
   ```html
   <title>CarryOn™ - Secure Family Preparedness & Estate Planning Platform</title>
   ```
4. **`index.html`** — Update `<meta name="description">`:
   ```html
   <meta name="description" content="CarryOn™ helps families organize estate plans, secure important documents, manage beneficiaries, and prepare for life's transitions — all in one secure platform." />
   ```
5. **Create `/app/frontend/public/robots.txt`**:
   ```
   User-agent: *
   Allow: /
   Sitemap: https://carryon.us/sitemap.xml
   ```
6. **Create `/app/frontend/public/sitemap.xml`**:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <urlset xmlns="http://www.sitemapns.org/schemas/sitemap/0.9">
     <url><loc>https://carryon.us/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
     <url><loc>https://carryon.us/login</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
     <url><loc>https://carryon.us/signup</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
     <url><loc>https://carryon.us/about</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
   </urlset>
   ```
7. **Create or source an OG image** (`carryon-og-image.jpg`) — 1200x630px with the CarryOn logo and tagline. Can use the existing `carryon-icon.jpg` as fallback initially.
8. **Canonical URL**: Add `<link rel="canonical" href="https://carryon.us/" />` to `index.html`

**Test**: 
- Use https://developers.facebook.com/tools/debug/ to verify Open Graph tags
- Use https://cards-dev.twitter.com/validator to verify Twitter cards
- Google "site:carryon.us" to verify indexing
- Check `https://carryon.us/robots.txt` returns valid content
- Check `https://carryon.us/sitemap.xml` returns valid XML

### P0 (Previously Completed)
- ECT Keyboard + ECT Delete + MM Download - DEPLOYED
- Customizable Dock - IMPLEMENTED
- ECT Bulk Delete - IMPLEMENTED
- Dynamic Subscription Pricing Editor - IMPLEMENTED (April 3, 2026)
- Homepage rewrite - IMPLEMENTED (April 3, 2026)
- Landing Page Refactoring - IMPLEMENTED (April 3, 2026)
- Mobile/PWA Background Fix - IMPLEMENTED (April 4, 2026)
- ECT Member Dropdown - IMPLEMENTED (April 5, 2026)

### P1
- Google Play Store Launch (operational steps)
- Share Extension Setup
- iOS Live Updates (Capgo)

### P2
- Readiness Scoring Policy Page
- Scalability Enhancements

### P3
- ECT Security Comparison Landing Page at `/security`

---

## Username Auth Migration Plan (April 2026)

### Architecture Decision
- **Username** = unique login identifier (not an email, 3-30 chars, alphanumeric + underscores)
- **Email** = non-unique communication channel (OTP delivery, notifications)
- **Beneficiaries** = invitation-only (no self-signup)
- **OTPs** = keyed by `user_id` (not email) to prevent collision with shared emails
- **Auto-generated usernames** = `firstnamelastname` (lowercase, no dot, no spaces)
- **Migration** = existing users get auto-generated usernames with `needs_username_review: true`

### 23 Touchpoints (Validated by Testing Agent)
**Backend `models.py`**: UserCreate (add username, remove benefactor_email/role), ForgotPasswordRequest (email→username), ResetPasswordRequest (email→username)
**Backend `auth.py`**: check-email→check-username, remove check-benefactor-email, login (reverse lookup order), register (username uniqueness), OTP storage ×3 (email→user_id), verify-otp (resolve by identifier), resend-otp, forgot-password (username-based), reset-password (username-based), NEW forgot-username, verify-password, _user_response (include username), dev-login (support username)
**Backend `beneficiaries.py`**: invitations/accept (auto-generate username)
**Backend `webauthn.py`**: login-options (support username lookup — CAUGHT BY TESTING AGENT)
**Backend `family_plan.py`**: member lookup (use user_id — CAUGHT BY TESTING AGENT)
**Frontend**: SignupPage (remove role/benefactor_email steps, add username), LoginPage ×3 forgot-password modals (email→username, add forgot-username), AcceptInvitationPage (add username field), AuthContext (pendingEmail→pendingIdentifier)

## Critical Notes
- **Downloads**: ALL file downloads MUST go through `platformDownload()` with `promptToSave` (never direct `navigator.share`)
- **Railway Build**: `requirements.txt` MUST have `--extra-index-url` as first line
- **ECT Avatars**: Always use `resolve_photo_url()`
- **MongoDB null safety**: Always use `(doc.get("field") or {}).get(...)` instead of `doc.get("field", {}).get(...)`
- **ECT Keyboard**: Always check `activeChannelRef.current` before applying viewport transforms
- **Toast import**: Always use `../utils/toast`, never `sonner` directly
- **SDV Filenames**: Always include file extension based on MIME type
