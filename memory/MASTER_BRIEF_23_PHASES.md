# MASTER BRIEF — 23-Phase Corrections (VERBATIM, re-pasted by founder Jun 2026)
# Status tracker at bottom. DO NOT LOSE THIS FILE. Execute phases IN ORDER.
# STOP-AND-REPORT gates: Phase 0, 1A, 4, 16, 17.

You are making a sequence of corrections to the CarryOn production platform: public marketing pages, legal pages, metadata, one backend feature removal, and one signup-flow change. Read this entire brief before making a single edit. Some phases correct public claims that are currently inaccurate. Those come first and matter more than anything cosmetic.

## CANONICAL FACTS — single source of truth

```
OPERATING_ENTITY:    CarryOn Technologies LLC
PARENT_ENTITY:       CarryOn Enterprises Inc. (Delaware corporation)
STREET_ADDRESS:      1550 Wilson Boulevard, 7th Floor
CITY_STATE_ZIP:      Arlington, VA 22209 USA
PHONE:               (703) 889-0017   ← CANONICAL as of Jun 2026 founder reversal. (703) 884-1527 is SUPERSEDED.
GENERAL_EMAIL:       info@carryon.us
PRIVACY_EMAIL:       privacy@carryon.us   (alias live, routes to founder@)
SECURITY_EMAIL:      security@carryon.us  (alias live)
SUPPORT_EMAIL:       support@carryon.us   (alias live — Schema.org keeps it; earlier replace instruction WITHDRAWN)
PRIMARY_DOMAIN:      https://www.carryon.us
APP_SUBDOMAIN:       https://app.carryon.us
OPERATIONS_COUNTY:   Arlington County, Virginia
```

Create one shared constants module (e.g. `src/config/companyInfo.js`, matching this codebase's conventions), export these values, import it everywhere contact information renders, and delete every hardcoded duplicate. All three email addresses are live and monitored — keep all three published and route them as they are today.

**Corporate structure — read carefully.** CarryOn Technologies LLC owns and operates the platform. CarryOn Enterprises Inc., a Delaware corporation, owns the LLC. The LLC is the party that contracts with users.

Therefore: **`OPERATING_ENTITY` is correct in footers, copyright lines, Terms of Service, and Privacy Policy, and stays as-is.** Do not replace it with the parent. The only change required is that the Terms and Privacy Policy should identify the LLC as a wholly owned subsidiary of `PARENT_ENTITY`, since users are entitled to know who ultimately controls their data. Flag the LLC's state of formation as `<<< COUNSEL — LLC STATE OF FORMATION >>>`; do not assume it matches the parent's.

## RULES OF ENGAGEMENT

1. **Execute phases in order.** Finish, verify, report, then move on. Never batch.
2. **Phases 0, 1A, 4, 16, and 17 require you to stop and report before editing.** They are marked. Do not proceed past a stop point without explicit approval. **The stop in 1A applies only to 1A.** Sub-phases 1B through 1F execute immediately in the same pass and must not be deferred, blocked, or bundled into the 1A approval request.
3. **Only Phase 4 modifies backend code, and its scope is fixed.** No other phase may touch authentication, encryption, key derivation, session handling, Stripe, or schemas. If you believe one does, stop and ask.
4. **Do not split the marketing site from the login experience.** The combined homepage — sign-in above, marketing copy below — is intentional and stays. Do not propose otherwise.
5. **Do not refactor anything not named here.** No renames, no folder restructuring, no dependency upgrades, no reformatting untouched files.
6. **Print the file path and target block before each edit; print the diff after.**
7. **Run the production build after every phase.** Zero errors, no new warnings. If a build breaks, revert that phase and report — do not work around it by touching other files.
8. **Copy in this brief is exact.** Do not paraphrase, improve, or expand it.
9. **Never invent a fact, price, statistic, source, date, or legal term.** Use `<<< PLACEHOLDER >>>` and report it.

---

# PHASE 0 — Discovery and audit (NO EDITS — stop and report)

Produce a written report covering all of the following. Make no changes.

### 0A. Estate Guardian data flow (highest priority — be exhaustive)

Trace the complete code path for Estate Guardian™ AI analysis and report precisely:

1. What data is read from the Secure Document Vault, and in what form — is it decrypted to plaintext before analysis?
2. Where does analysis execute? Name every external endpoint contacted, including the model provider (expected: xAI / Grok) and any web-search or retrieval service.
3. Exactly what payload leaves CarryOn infrastructure. Full document text? Extracted fields? Embeddings? Prompts containing user content?
4. Is conversation or thread history retained? Where, for how long, encrypted or not, and is prior thread content resent on subsequent turns?
5. What contractual or configuration controls exist on the provider side — is training-data exclusion enabled, and what is the provider's stated retention?
6. Are provider API keys and calls server-side only, or can any vault content reach a third party from the browser?
7. Does the same path apply to the Beneficiary Estate Concierge (BEC)? Report separately if it differs.

### 0B. Retention and destruction reality

The homepage claims sensitive records are permanently eliminated after tasks complete. Report what is actually deleted anywhere in the system, on what trigger, with what verification — including trustee task artifacts, EGA threads, uploaded documents, and soft-deleted records still present in the database.

### 0C. Voice biometrics footprint

Report every location where voiceprint or voice-biometric functionality exists: the triple security lock optional feature set in security settings, enrollment and verification endpoints, database fields and collections, stored voiceprint records, and the count of accounts that currently have it enrolled.

### 0D. Pricing

Report every subscription tier that exists in the codebase and platform config: exact tier names, prices, billing cadence, trial length, feature allocations, the family-bundle discount structure, the military/veteran discount, the 18–25 New Adult tier, the hospice program, and Founders Circle Lifetime terms. Report where each value is stored — hardcoded, database, or founder-portal config. **This is the source for Phase 16; do not invent any part of it.**

### 0E. Free-tier and beneficiary billing logic

Report the implemented behavior for: trial length and where it is configured; what happens at trial expiration; the 90-day post-trial retention window and what notice is sent during it; what is deleted at day 90; and the beneficiary billing rule that sets a beneficiary's tier based on the tier held for 51% of the benefactor's enrolled time. Report where and when beneficiaries are told about that obligation.

### 0F. Infrastructure

Report actual current hosting from config and deployment files: backend host, frontend host, database, and any change from Railway. Report the backend version and build tag.

### 0G. Routing, metadata, and duplication

1. Router library, route declarations, and the full public route list. Report whether `/founder` and `/founder-about` both resolve.
2. Whether `app.carryon.us` serves the same application as `www.carryon.us`, how it is configured, and whether it is indexable.
3. `index.html` path and every meta tag it declares.
4. Whether `react-helmet-async` or any head-management library is installed.
5. Whether page content is fetched client-side from `/api/public/site-content`, and what is present in the initial HTML before JavaScript executes.
6. Existing Schema.org markup — location, types, and every value it contains, especially addresses and phone numbers.
7. The PWA manifest path and its current `name`, `short_name`, and `description`.
8. Whether `sitemap.xml`, `robots.txt`, and `/.well-known/security.txt` exist and what they contain.

### 0H. Frontend specifics

1. The file rendering `BUILD V2026.05.27.AUTHSRC` and what controls its visibility.
2. Whether the homepage hero is duplicated for breakpoints, and the heading level of each copy.
3. The signup flow: file path, step structure, fields per step, and validation.
4. **Where the account-holder `gender` value collected at signup is consumed.** Name every read. If relationship terms (son, daughter, grandmother) derive from a per-beneficiary relationship field instead, say so explicitly.
5. Every file containing a street address, phone number, email address, or the string `carryon.com`.
6. How many distinct footer components exist.

**Stop. Present this report. Wait for approval.**

---

# PHASE 1 — Correct inaccurate public claims (highest priority)

Several live public statements appear to be untrue. This phase corrects them.

## 1A — Estate Guardian claims (stop and report before editing)

Based on the Phase 0A findings, report which of the following current statements are inaccurate:

- Homepage: "Estate Guardian™ AI operates entirely within your encrypted vault — no data ever leaves"
- Homepage: "AES-256 per-estate encryption — your family's data is never accessed by our team"
- `/about`: "Zero-knowledge encryption. Air-gapped AI. No backdoors. No exceptions."
- `/security`: "Zero-knowledge vault contents. Engineering staff cannot read your stored documents."
- `/privacy`: the data security section's use of "zero-knowledge"

If vault content is transmitted to a third-party model provider, then "no data ever leaves," "air-gapped AI," and unqualified "zero-knowledge" are false as written and must change.

**Then propose replacement copy derived strictly from the Phase 0A findings.** Do not write aspirational language. The replacement must state accurately: how documents are encrypted, who on staff can and cannot access them, that AI analysis involves a named third-party provider under contract, what leaves the system, what the provider is contractually barred from doing with it, and what is retained. Present the proposed copy and wait for approval before editing.

Suggested structure for `/about` values bullet, to be adjusted to fit the facts:

> Per-estate AES-256 encryption. No staff access to your documents. AI analysis performed by a contracted provider under strict data-handling terms, with your content excluded from model training. No backdoors. No exceptions.

Then grep for "zero-knowledge," "air-gapped," and "no data ever leaves" sitewide and report every instance with its file and line.

## 1B — Remove the record-destruction claim (EXECUTE NOW — do not wait for 1A approval)

**DONE in previous session (removed from LandingContent.js + trusteePageConstants.js, verified by grep).**

The homepage security section contains this bullet:

> Post-execution record destruction — sensitive records are permanently eliminated after tasks complete

Delete the entire bullet, surgically. Verify: grep `Post-execution`, `permanently eliminated`, and `record destruction` across the frontend, the backend, and any content collection — all zero hits.

## 1C — Qualify the financial-institutions claim

The homepage security section opens by claiming the same security standards that protect financial institutions and government systems. This is unverifiable. Replace the sentence with:

> Every layer of CarryOn™ is built on the encryption, key-management, and access controls we document publicly — because the people you love deserve nothing less.

Make "document publicly" a link to `/security`.

## 1D — Replace the dated security tagline

Beneath the sign-in form, "Bank-grade security · 256-bit SSL" is both dated and imprecise — you run TLS 1.3, not SSL. Replace with:

> AES-256 encryption · Per-estate keys · TLS 1.3

## 1E — Align the SOC 2 claim

The homepage bullet asserting "SOC 2 compliance architecture with full audit trail and GDPR data rights built in" conflicts with `/security`, which correctly states the Type II audit is in progress and explicitly declines to claim attestation. Replace the homepage bullet with:

> SOC 2 Type II audit in progress — full audit trail and GDPR data rights built in

Link it to `/security`.

## 1F — Add a homepage path to the security page

There is currently no link from the homepage to `/security` or `/wind-down-promise`. Add a prominent link to both at the end of the homepage security section.

---

# PHASE 2 — Contact and entity data integrity

1. Build the constants module described in CANONICAL FACTS.
2. Replace `support@carryon.com` in both the Privacy Policy and Terms of Service contact sections with `GENERAL_EMAIL`. Grep for `carryon.com` and report every remaining hit — there must be zero in rendered code.
3. Replace every street address and phone number sitewide with the constants. The values `1509 N Scott St., Unit B` and `(703) 889-0017` are superseded and must not appear anywhere.
4. **Entity naming: `OPERATING_ENTITY` stays.** Do not change "CarryOn Technologies LLC" in footers, copyright lines, or legal pages. Confirm it renders consistently everywhere and comes from the constants module rather than hardcoded strings. Report any page naming a different entity.
5. In the Privacy Policy, designate `PRIVACY_EMAIL` for data access, correction, deletion, and portability requests, alongside `GENERAL_EMAIL` for general inquiries.
6. Verify existing Schema.org markup carries `OPERATING_ENTITY` and does not contain a superseded address or phone number.

**Verify:** grep for both superseded addresses, both superseded phone numbers, and `carryon.com` — all zero hits.

---

# PHASE 3 — Correct the infrastructure claim on /security

The platform migrated to Render approximately two months ago. `/security` still states Railway (US East). That page declares itself the source of truth and promises it changes before practice does, so a stale entry undermines the page's core commitment.

1. Using the Phase 0F findings, correct the infrastructure section to name actual current hosting for backend, frontend, and database. Do not assume — use what you found in config.
2. Add a changelog entry at the bottom of `/security` in this format:

> **Changelog**
> `<<< DATE >>>` — Updated infrastructure section to reflect migration of backend services to Render. Corrected AI-processing disclosure. Removed voice biometric references.

3. Update the "Last updated" date.
4. Add a subprocessor list to `/security` naming every third party that processes user data — the model provider identified in Phase 0A, Stripe, the email provider, Twilio, the database host, and error monitoring. This is expected under GDPR and is a genuine trust asset.

---

# PHASE 4 — Remove voice biometrics (backend — stop and report)

Voice biometrics are not part of the product. They must be removed from code, from the database, and from the Privacy Policy.

**Before editing, report:** the number of accounts with a voiceprint enrolled, every database field and collection holding voiceprint data, and every endpoint involved. Present a removal and data-purge plan. Wait for approval.

Then, on approval:

1. Remove the voice biometric option from the **triple security lock optional feature set** in security settings.
2. Ensure any account with it enrolled degrades safely to its remaining security factors. **No account may be left unable to authenticate.** State explicitly how you verified this.
3. Purge stored voiceprint records from the database. Confirm no soft-deleted copies remain.
4. Remove associated endpoints and dead code.
5. Remove every voice-biometric and voiceprint reference from the Privacy Policy and Terms of Service.

**Do not touch any other authentication factor, the remaining lock options, 2FA, or WebAuthn.**

---

# PHASE 5 — Footer parity

The homepage footer links only Privacy, Terms, and a non-functional "Accessibility" label. `/about` additionally links Security and Wind-Down Promise. Result: your two strongest trust pages are unreachable from your highest-traffic page — an external reviewer with a crawler failed to find either.

1. Consolidate to a single `<Footer />` used by every public route. Delete duplicates.
2. Link order: Privacy Policy → Terms of Service → Security → Wind-Down Promise → Pricing → Accessibility.
3. "Accessibility" currently renders as inert text on every page. Make it link to `/accessibility` (Phase 13).
4. Render `OPERATING_ENTITY`, `STREET_ADDRESS`, `CITY_STATE_ZIP`, `PHONE`, and the copyright line from constants.

---

# PHASE 6 — Hide the build badge in production

Gate `BUILD V2026.05.27.AUTHSRC` behind an environment check so it renders only in development and preview. Do not delete the component. Use the existing environment variable; report which.

---

# PHASE 7 — Terminology consistency

1. Canonical name is **Immediate Action Checklist (IAC)**. On `/wind-down-promise`, the export bullet reads "Important Account Checklist" — correct it.
2. Grep for "Important Account Checklist" and report remaining hits.
3. Report, without changing, any other feature name appearing with two expansions.

---

# PHASE 8 — Stop app.carryon.us competing with www

`app.carryon.us` serves a complete, indexable copy of the public marketing site. Two identical sites compete for the same searches and split ranking signals.

**Do not change routing or redirects — the login flow must not be touched.** Instead:

1. Serve `X-Robots-Tag: noindex` for all responses on `APP_SUBDOMAIN`, or emit a `noindex` meta tag when the app detects it is running on that host. Use whichever is supported by current hosting config.
2. Ensure canonical tags on `APP_SUBDOMAIN` point to the corresponding `PRIMARY_DOMAIN` page — not the root. This depends on Phase 9 and may be implemented alongside it.
3. Confirm `www.carryon.us` remains fully indexable.

---

# PHASE 9 — Per-route metadata, canonicals, and structured data

Every route currently serves an identical title, identical description, and a canonical pointing at the root, so every subpage declares itself a duplicate of the homepage.

1. If no head-management library exists, add `react-helmet-async` and wrap the root in `HelmetProvider`. If one exists, use it.
2. Build a reusable `<SEO />` component taking `title`, `description`, `path`, `noindex`. It renders title, description, `<link rel="canonical" href={PRIMARY_DOMAIN + path}>`, plus matching `og:` and `twitter:` tags. Global static tags stay in `index.html`.
3. Remove the hardcoded title, description, canonical, and per-page `og:`/`twitter:` tags from `index.html` **only after** per-route rendering is confirmed working.
4. Apply to every public route:

| Route | Title | Description |
|---|---|---|
| `/` | CarryOn™ — The Family Continuity Platform | If something happens tomorrow, your family knows exactly what to do. The complete continuity system for every disruption — hospital stay, deployment, disaster, or the final day. |
| `/about` | About CarryOn — Readiness for Every Family | Why CarryOn exists: secure, affordable family continuity infrastructure built for every household. Our mission, values, founder, and the teams behind the platform. |
| `/security` | Security & Trust — CarryOn | AES-256-GCM encryption, per-estate keys, 2FA, subprocessors, and our full security posture — documented honestly and updated before practice changes. |
| `/wind-down-promise` | Wind-Down & Data Portability Promise — CarryOn | Our binding written commitment: 90 days notice, full self-service export, and an open-source decryption tool. Your family's data always comes home with you. |
| `/pricing` | Pricing — CarryOn | Transparent pricing for family continuity. Free to start, free for hospice patients, military and veteran discounts, family bundle savings, and a dedicated tier for ages 18–25. |
| `/privacy` | Privacy Policy — CarryOn | How CarryOn collects, uses, protects, shares, and returns your family's data. |
| `/terms` | Terms of Service — CarryOn | The terms governing your use of the CarryOn family continuity platform. |
| `/accessibility` | Accessibility — CarryOn | Our commitment to WCAG 2.1 AA conformance and how to report an accessibility barrier. |

5. Apply `noindex` to `/signup`, `/login`, `/founder-about` (and `/founder` if it resolves), and all authenticated routes.
6. Remove the `<meta name="keywords">` tag.
7. **Audit — do not duplicate — the existing Schema.org Organization and SoftwareApplication markup.** Correct every value against CANONICAL FACTS. Report what it contained before. If Phase 0G found no markup, add Organization JSON-LD on `/` only.
8. Add or correct `public/robots.txt`: allow crawlers, disallow authenticated paths, reference the sitemap.
9. Add or correct `public/sitemap.xml` covering the eight indexable routes above.
10. **Fix the PWA manifest.** It currently describes CarryOn as "Secure estate planning and legacy management for every American family," which is the superseded positioning and is user-visible in install prompts. Replace the description with:

> The family continuity platform. Keep your family ready, connected, and clear through any disruption.

Update `name` and `short_name` if they carry the old positioning.

**Verify:** view source on each route — unique title, unique description, self-referencing canonical. `/signup` and `/login` carry `noindex`.

---

# PHASE 10 — Crawlability assessment (REPORT ONLY — no implementation)

Marketing copy appears to be fetched client-side from `/api/public/site-content`, meaning page content may not exist in the initial HTML at all. If so, per-route metadata alone will not fix indexing.

Report: exactly what a crawler receives before JavaScript executes on each public route; whether the current host supports prerendering or static generation for these routes; and two or three viable options with their tradeoffs. **Implement nothing.** This is an architectural decision requiring approval.

---

# PHASE 11 — Restore pinch-zoom

The viewport meta tag contains `maximum-scale=1, user-scalable=no`, disabling pinch-to-zoom. This is a WCAG 2.1 AA failure (SC 1.4.4) and is especially harmful for an audience that is often older and frequently reading under stress.

1. Change the viewport tag to exactly: `width=device-width, initial-scale=1, viewport-fit=cover`
2. Check every page at 200% zoom on a 375px viewport. **Report** any horizontal overflow, clipped text, overlap, or unreachable control — do not silently restyle.

---

# PHASE 12 — Heading structure and hero duplication

1. Determine whether both homepage hero blocks are in the DOM simultaneously or conditionally rendered.
2. If both are present, ensure exactly one is exposed to assistive technology: `aria-hidden="true"` on the hidden variant, hidden via `display: none` rather than opacity or off-screen positioning.
3. Exactly one `<h1>` exposed per page sitewide.
4. Audit for skipped heading levels. Fix only where the fix is a heading-level change with no visual change; otherwise report.
5. Confirm the "Skip to main content" link targets a real, focusable `#main-content` on every page.

---

# PHASE 13 — Accessibility statement page

Create `/accessibility`, styled to match `/security`:

- Heading: **Accessibility at CarryOn**
- Commitment: CarryOn targets WCAG 2.1 Level AA. Because families often use the platform during medical crises, evacuations, and bereavement, accessibility is treated as a core requirement rather than a compliance exercise.
- In place: keyboard navigation, skip links, visible focus indicators, text resizing and pinch-zoom support, semantic headings and landmarks, contrast targeting AA.
- Known limitations: state plainly that no third-party audit has been completed and that findings will be published here when one is. Claim no unverified conformance.
- Reporting: `GENERAL_EMAIL` and `PHONE`, with a five-business-day response commitment.
- "Last updated" date.

---

# PHASE 14 — Founder visibility on /about

`/founder-about` stays gated — that is intentional and is not to be changed. But the Wind-Down Promise already names the founder publicly and states his service, so those facts are not confidential today, while `/about` describes an unnamed team.

1. Add a brief "Founder" section to `/about` before "Who We Are": name Barnet Harris, the 24-year military service line, and the bootstrapped-from-inception line already used on `/wind-down-promise`. Three or four sentences. Reuse existing wording; write no new biography.
2. Leave a clearly marked placeholder for a headshot. Do not generate or source an image.
3. Add one neutral public sentence above the gate on `/founder-about` so a first-time visitor understands what they are requesting rather than hitting a dead end.
4. If both `/founder` and `/founder-about` resolve, canonicalize to one and report which.

---

# PHASE 15 — Cite or remove statistics

The 76% figure on `/about` and the hospice population figure on the homepage are uncited. Add an inline source and year to each, or remove the figure. **Insert `<<< SOURCE NEEDED >>>` markers — do not invent citations.** Report both locations.

---

# PHASE 16 — Pricing page (stop and report before building)

The site references family-bundle discounts, military and veteran pricing, an 18–25 tier, hospice access, Founders Circle Lifetime, and "Free to start" — with no pricing page anywhere. This is the largest conversion gap on the site.

**First, present the complete tier structure discovered in Phase 0D and confirm it before building.** Do not invent any price, tier name, or allocation.

Then create `/pricing`, linked from primary navigation and footer:

1. Tier comparison built from confirmed values.
2. **Free to start** — explain accurately: a person can sign up, upload documents, and never pay.
3. **The 90-day retention rule, stated plainly and prominently.** After the trial period expires, an unconverted account has 90 days to download everything before the profile is deleted. This is the deletion of a family's wills and directives, so it must be conspicuous, not fine print. State the trigger (trial expiration), the window, what notice is sent, and how to export.
4. **Beneficiary billing, stated plainly.** Beneficiaries are free while their benefactor is living. On transition, a beneficiary's tier is set by the tier the benefactor held for at least 51% of their enrolled time. Write this in plain English — a beneficiary inheriting a paid obligation must be able to understand it before accepting an invitation.
5. **Hospice program** — free full platform access for U.S. citizens and resident aliens in certified hospice care. Reuse existing homepage copy verbatim.
6. **Military and veteran** and **18–25 New Adult** sections — reuse existing homepage copy verbatim.
8. FAQ: what happens when a subscription lapses, whether beneficiaries keep access, how to cancel, how to export. Answer from confirmed implementation; placeholder anything unknown.
9. **No Stripe or checkout wiring in this phase.** Static page only.

---

# PHASE 17 — Beneficiary obligation disclosure (report, then implement copy only)

A beneficiary who accepts an invitation may later inherit a paid subscription obligation under the 51% rule. Report where and when a beneficiary is currently told this — invitation email, acceptance screen, or nowhere.

If disclosure is absent or unclear, draft plain-English copy for the invitation and acceptance flow explaining that beneficiary access is free while the benefactor is living, and what happens at transition. **Present the copy and the proposed placement; implement only after approval, and only copy — no billing logic.**

---

# PHASE 18 — Legal pages (DRAFT ONLY — attorney review required)

Mark every new or modified section with `<!-- DRAFT — PENDING ATTORNEY REVIEW -->`. Do not remove an existing clause without flagging it.

## 18A — Terms of Service

1. Confirm the contracting party is `OPERATING_ENTITY`, with its principal place of business in `OPERATIONS_COUNTY`, and add a sentence identifying it as a wholly owned subsidiary of `PARENT_ENTITY`. Mark its state of formation `<<< COUNSEL — LLC STATE OF FORMATION >>>`.
2. **Governing law.** The current clause names "the laws of the United States" with no state, which is not enforceable as drafted. The operating entity is an LLC with a Delaware-incorporated parent and operations in Virginia, so present the standard constructions as commented alternatives for counsel to select — the LLC's state of formation, or Virginia — each with exclusive venue. Do not choose. Leave arbitration and class-action-waiver language as `<<< COUNSEL DECISION >>>`.
3. **Section 2 service description.** It currently defines CarryOn as an estate planning and estate plan management platform, which contradicts the continuity positioning throughout the site. Replace with: a family continuity platform enabling users to organize, secure, and share critical information with designated beneficiaries, including document storage, beneficiary management, checklist tools, guided response protocols, and AI-assisted analysis. **The disclaimer that CarryOn does not provide legal, financial, or tax advice must survive verbatim.**
4. **Add a subscription, renewal, and cancellation section.** Recurring billing without explicit renewal, cancellation, and refund disclosure creates exposure under state automatic-renewal statutes. Cover trial length, renewal cadence, automatic renewal until cancelled, how and when cancellation takes effect, and refund policy. Refund specifics: `<<< PLACEHOLDER >>>`.
5. **Add a data retention and deletion section** covering the 90-day post-trial window: the trigger, the notice schedule, the export right, and that the profile and its contents are deleted at the end of the window. This is the most consequential clause in the document — a user must not encounter it for the first time at day 89.
6. **Add a beneficiary obligations section** describing the 51% tier rule.
7. **Add a death-or-incapacity-of-account-holder section.** Cover what happens on verified transition, who may act, the Transition Verification Team process contractually, and beneficiary entitlements. Specifics: `<<< PLACEHOLDER >>>`.
8. **Incorporate the Wind-Down Promise by reference**, citing its URL — it currently calls itself binding while living outside the contract.
9. **Add Founders Circle Lifetime terms**: what "lifetime" is measured against, transferability, and treatment on wind-down.
10. Add dispute resolution and a DMCA/copyright-agent section.
11. Remove all voice biometric references. Update "Last updated."

## 18B — Privacy Policy

1. **Remove every reference to voice biometric data and voiceprints.** The feature is not part of the product and the language creates regulatory obligations under Illinois BIPA, Texas CUBI, and Washington law for no benefit.
2. **Add a subprocessor section** naming every third party processing user data, including the AI model provider identified in Phase 0A.
3. **Add an AI processing section** describing, accurately and per Phase 0A: what content is sent for analysis, to whom, whether it is used for training, what is retained, and for how long.
4. Add a cookies and tracking section.
5. Add data retention periods, including the 90-day post-trial deletion window.
6. Add CCPA/CPRA: California rights, do-not-sell-or-share statement, authorized-agent process, non-discrimination.
7. Add GDPR: legal bases, controller identity, international transfer mechanism.
8. Add children's data: platform is 18+, no knowing collection from minors, and how minor beneficiaries are handled.
9. Add breach notification commitments.
10. Reconcile all "zero-knowledge" language with the Phase 1A outcome.
11. Update "Last updated" and align the date convention with `/security`.

---

# PHASE 19 — Signup flow

The page promises account creation in seconds, then opens with legal name, middle name, suffix, gender, and date of birth before collecting an email address — maximizing drop-off at the moment of least commitment.

1. **Step 1 collects email and password only.** Move legal name, middle name, suffix, date of birth, and gender to step 2.
2. **Gender stays** — it is required for relationship terminology. Move it to step 2 with helper text: "Used for relationship terms in your family plan." If Phase 0H found the account-holder value is never read, report that finding and recommend accordingly, but change nothing beyond the move.
3. Update the sub-headline from "Create your account in seconds" to: **"Start in under a minute. Build the rest at your pace."**
4. Persist partial progress **only if** a mechanism already exists. If not, report as a recommendation and change nothing.
5. **Do not change validation rules, password requirements, the account-creation API call, or 2FA behavior.**

**Verify:** full signup completes end to end in a test environment; no validation weakened.

---

# PHASE 20 — CTA and positioning consistency

1. Standardize the primary signup CTA sitewide to **"Start your family's plan."** Replace "Open Account" and "Get Started" wherever they invoke signup. Keep "Create Account" on the login form only, where it contrasts with "Sign In."
2. Replace the `/signup` headline "Join CarryOn. Protect Your Estate Plan." with **"Join CarryOn. Get your family ready."**
3. Report every remaining sitewide instance of "estate planning platform" or equivalent superseded positioning.

---

# PHASE 21 — Homepage information architecture

The four-pillar section presents roughly twelve named systems with acronyms — Beneficiaries, MM, FFN, DTS, EPT, SDV, DAV, EGA, CFP, CES, IAC, CCP, ECT, BEC. This demonstrates depth to an insider and complexity to a first-time visitor, contradicting the calm the page promises.

1. **Keep all four pillars.** Under each, surface only the one or two strongest capabilities in full. Collapse the remainder behind a per-pillar "See everything in this pillar" disclosure — accordion or link to a detail page. **No content is deleted; it is relocated.**
2. Remove parenthetical acronyms from the primary visible copy. Keep full names. Acronyms may remain inside the expanded detail.
3. **Move a condensed version of the five-step "You don't have to do it all at once" section above the four pillars**, so a visitor learns what they actually do before being shown the full system. Condense to four short steps: invite your people → add what matters → set what should happen → live your life. The full five-step section stays where it is.
4. Do not change the design system, color palette, or typography.

---

# PHASE 22 — Performance and assets

1. Replace the eager YouTube iframe with a click-to-load facade — static thumbnail plus play button that swaps in the iframe on click. Hand-roll it; add no video library.
2. `flag-bg.jpg` is a full-bleed background on multiple pages. Serve modern formats via `<picture>`, add responsive `srcset`, and set `loading="lazy"` below the fold. **Do not change visual appearance.**
3. `og:image` points at `carryon-icon.jpg` while declaring 1200×630. Verify actual dimensions and report a mismatch. Do not create a replacement image.
4. Confirm `/.well-known/security.txt` resolves, points to `SECURITY_EMAIL`, and has not expired.

---

# PHASE 23 — Final verification

- [ ] Production build: zero errors, no new warnings.
- [ ] All public routes load: `/`, `/about`, `/founder-about`, `/security`, `/wind-down-promise`, `/pricing`, `/privacy`, `/terms`, `/accessibility`, `/signup`, `/login`.
- [ ] Zero console errors on any route.
- [ ] Every footer link resolves on every page.
- [ ] Grep returns zero hits: `carryon.com`, `1509 N Scott`, `889-0017`, `Important Account Checklist`, `voiceprint`, `voice biometric`, `air-gapped`, `Bank-grade`.
- [ ] The record-destruction bullet is gone from the homepage (Phase 1B). Confirm by grepping `Post-execution` and `permanently eliminated` — both zero hits.
- [ ] No unqualified "zero-knowledge" or "no data ever leaves" remains anywhere.
- [ ] View source per route: unique title, unique description, self-referencing canonical.
- [ ] `/signup`, `/login`, `/founder-about` carry `noindex`; `app.carryon.us` is noindexed; `www.carryon.us` is indexable.
- [ ] PWA manifest carries current positioning.
- [ ] Pinch-zoom works; no horizontal overflow at 375px; exactly one `<h1>` exposed per page.
- [ ] Signup completes end to end; login, 2FA, and session behavior unchanged.
- [ ] Every account previously using voice biometrics can still authenticate. State how this was verified.
- [ ] No backend file modified outside Phase 4.

**Final report:** every file changed; every `<<< PLACEHOLDER >>>` with file path and line; every item flagged rather than fixed; anything you could not complete and why.

---

# STATUS TRACKER (maintained by agent — update after every phase)

- [x] Phase 0 — audit report delivered & APPROVED by founder
- [x] Phase 1B — record-destruction bullet removed (repo clean, verified by grep; NOT YET DEPLOYED — still in live bundle main.300fdb9a.js until founder pushes to GitHub)
- [x] Phase 1C — financial-institutions sentence replaced w/ approved copy + /security link (LandingContent.js)
- [x] Phase 1D — "Bank-grade security · 256-bit SSL" → "AES-256 encryption · Per-estate keys · TLS 1.3" (LoginPage ×3, SignupPage, PartnerPortalPage)
- [x] Phase 1E — SOC 2 bullet → "SOC 2 Type II audit in progress — …", linked to /security
- [x] Phase 1F — security section now links to /security + /wind-down-promise
- [x] Phase 1A — APPROVED (rows 1 & 4 amended by founder) and APPLIED: all 16 rows + revised C3 + 2 additional zero-knowledge instances found during verification (AcceptInvitationPage.js:272,453 — grep truncation had hidden them). Build clean (main.3a7efde2.js). Sitewide grep: zero-knowledge/air-gapped/no-data-ever-leaves/never-accessed/Bank-grade = 0 hits in rendered copy (only the /security disclosure sentence "not a zero-knowledge system in the cryptographic sense", which is the approved amendment).
- NOT YET DEPLOYED to production (ships with next founder push).
- Footer phone in production API STILL (703) 889-0017 as of this session's check — founder believed it fixed; portal save may not have persisted. Line2 missing " USA". Address line1 fixed.
- /landing-consumer: noindex/canonical decision SUSPENDED by founder (unique live-pricing content). Phase 16 design now open question (new /pricing vs upgrade).
- E2 finding: SubscriptionPaywall is dismissible ONLY while trial active (SubscriptionPaywall.js:1046) — at trial expiry paywall is modal+non-dismissible → export unreachable through UI; "data remains accessible for export" not true in practice at expiry. Flagged.
- GetStartedPage "130+ Families Protected" — uncited stat, added to Phase 15 list.
- [ ] Phase 2, 3
- [ ] Phase 4 (STOP GATE)
- [ ] Phase 5–15
- [ ] Phase 16 (STOP GATE), 17 (STOP GATE)
- [ ] Phase 18–23

# AMENDMENTS — approved by founder (June 2026 message), BINDING

## B. xAI terms
- NO DPA / enterprise agreement with xAI exists. PROHIBITED words: "contractual(ly)", "under contract", "enterprise agreement", "DPA", "zero-knowledge", "air-gapped", "no data ever leaves", "never leaves your vault" (in EGA/BEC context).
- PERMITTED: AI analysis performed by xAI; content transmitted to xAI's API; xAI's PUBLISHED API policy excludes API inputs/outputs from model training by default (attribute to xAI's policy, never to an agreement).
- Lead 1A copy with the ai_eligible fail-closed gate (only flagged docs transmitted; unflagged excluded entirely incl. names).
- Privacy Policy AI section must disclose FULL payload: benefactor name+street address, marital status, beneficiary names/ages/genders/emails — not just "document contents".
- xAI ZDR: team-level setting in xAI console (Team Settings → Zero Data Retention); default = 30-day retention for abuse audit then deletion; no per-request header. REPORTED, not changed.

## C. Describe implemented reality, never intended policy
- C1: 51% rule DOES NOT EXIST — never mention it. Reality: beneficiaries free while benefactor living → verified transition → 30-day grace w/ email → beneficiary selects ben_* plan ($1.99–$4.99/mo).
- C2: NO post-trial deletion clock. Trial = 30 days → paywall only; data stays exportable. The 90-day grace/purge applies ONLY on Stripe subscription cancellation (notices 90/60/30/15/10/5/4/3/2/1; purge removes file content, keeps metadata, MMs untouched). Flag unfired `trial_ended` trigger (grace_period.py:34) in final report; do NOT wire it.
- C3: Family bundle reality: benefactor discount 0%, beneficiaries on family plan 100% free. Homepage card at LandingContent.js:113 promising percentage-based household discounts is FALSE — rewrite (copy proposed at 1A stop).

## D. Amendments
- D1: seven extra routes in scope: /our-promise /voices /get-started /speak-with-us /landing-consumer /partner-brief /quickstart/try — claims folded into Phase 1, footer (Ph5) + metadata (Ph9) treatment; titles/descriptions proposed for approval.
- D2: Schema.org — REMOVE aggregateRating entirely; fix-or-remove SoftwareApplication offers (stale $0/$9/$19); confirm support@carryon.us inbox live or replace w/ info@carryon.us. (Founder must confirm inbox.)
- D3: sitemap — remove /login+/signup, add approved D1 routes, no tokened/auth routes.
- D4: "Powered by CarryOn Enterprises Inc." on partner pages — report context + recommend only. SMS consent entity must match A2P 10DLC registration — founder to confirm registered entity before any change.
- D5: soft-deleted docs — preview: 0/13 rows hold inline file_data; 13 dangling storage_key strings (blobs hard-deleted at delete time). Production unverifiable from pod; needs founder-run check.
- D6: EGA/BEC transcripts plaintext — remediation proposal delivered (report only). Constrains 1A: no unqualified "staff cannot read" claims.

## E. Pricing pre-Phase-16 items (reported)
- **PRODUCTION VALUES (Jun 2026, from live GET /api/subscriptions/plans — THE Phase 16 source):**
  - Premium 24.99/22.49q/19.99a ben 6.99 paired 2.99 · Standard 19.99/17.99/15.99 ben 5.99 paired 3.99 · Base 9.99/8.99/7.99 ben 4.99 paired 4.99 · Military 8.99 ben 3.99 paired 1.99 · Veteran 8.99 ben 3.99 paired 1.99 · Seniors 12.99 ben 1.99 paired 3.99 · New Adult 3.99 ben 1.99 paired 1.99 · Hospice 0 ben 4.99 paired 4.99 · Enterprise 0
  - beneficiary_plans (prod, 7 rows — NO ben_new_adult/ben_seniors): ben_premium 6.99, ben_standard 5.99, ben_base 4.99, ben_military 3.99, ben_veteran 3.99, ben_hospice 4.99, ben_enterprise 0
  - **beta_mode: FALSE in production** (billing is LIVE). family_plan_enabled true; family discounts: benefactor 30%, beneficiary 50% (flat, not scaling).
  - FC: active, 499/399/199/79/179/179/399 (matches code/preview).
  - PREVIEW numbers (Phase 0 0D table) are WRONG for production — never use them for public copy.
- Seniors concern REVERSED in prod: 12.99 < Standard 19.99 → Seniors IS a discount tier. E1 flag resolved.
- paired_price NOT self-healed (admin-set); ben_price/features/quarterly/annual ARE force-synced from code+ben plans on every settings read (plans.py:490-536).
- C3 REDRAFT NEEDED from prod values: family bundle claim is half-true (percentage-based yes 30/50; "more you save" scaling no). Proposed: "save 30% on your own subscription and 50% on every family member you add" — pending founder approval.

## SESSION LOG 3 — production counts round (Jun 2026)
- PRODUCTION COUNTS (founder-run script): voiceprint users 0, voice-passphrase docs 0, section_security voice rows 1, soft-deleted docs 6 (0 w/ file_data), chat_history 70, BEC 1, **trial_days = 10** (key='trial_policy').
- FOUNDER DECISIONS: trial copy must be DYNAMIC (A2/A3 pending — inventory reported, edits gated); Seniors+NewAdult ben price $1.99 ✔ FIXED; address = "Arlington, VA 22209" (no USA) ✔ APPLIED everywhere; full-ZIP NOT being built — wind-down gets 3-state rewrite (D3 wording pending approval); trust line ✔ IMPLEMENTED on /get-started.
- EXECUTED: B1 ben-plans merge self-heal (plans.py — prod heals on deploy), B2 plan_map + seniors/new_adult, B3 auto via SubscriptionsTab; PHASE 4 VOICE REMOVAL COMPLETE (deleted services/voice_biometrics.py + routes/documents_voice.py, server.py unregistered, documents.py legacy-voice→backup-code degrade, route_policies + route_policies_auto cleaned, staff_tools + IntegrationsTab cleaned, Privacy/Terms refs removed, Vault UI stripped: VaultPage/UploadPanel/UnlockModal(rewritten)/DocumentCard; preview section_security cleaned — PROD ROW 1 REMAINS: founder one-liner or self-heals on next security save; security.py janitor KEPT intentionally as the healing mechanism); G paired_price REMOVED (code defaults ×9, admin setter, route policy, status block+field; API-layer strip added so stored prod copies never surface; preview DB unset); C address aligned (6 files + preview DB); D5 "Export everything" banner link; "130+ Families Protected" removed + approved trust line added.
- D1 EXPORT GATE: **FAILED** — compliance data-export MISSING: DAV secret values, financial picture, entities, FFN list, MM text bodies, CCP/wills/timeline user data. D2 restriction BLOCKED until gaps fixed & approved.
- Builds: main.07d2c4ca.js clean. E6 verified: fresh register/login/authed reads 200; zero auth/guards/middleware files modified (git status clean).
- A4: cadence auto-adapts (REMINDER_CADENCE per duration; 10d → [7,3,1]); only non-allowed custom durations would silently drop reminders.
- TRIAL COPY INVENTORY (for A2/A3 when approved): GetStartedPage 625+633, LandingPage 179+287+373, LandingPricing 229, ResetTrialModal 90 (admin), admin.py:267 (audit text), + 10 stale bakes in prerendered landing-consumer HTML.

## SESSION LOG 2 — phone reversal + B/C/E investigations (Jun 2026)
- PHONE CANONICAL REVERSED by founder: (703) 889-0017 is canonical; 884-1527 superseded. All 9 code hits of 884-1527 corrected (fallbacks, AboutPage, Schema.org index.html, founder-story.html, SiteContentTab) + preview DB synced. Unbounded grep = 0 hits.
- " USA" on footer line2: PENDING founder decision.
- "130+ Families Protected" REMOVED from GetStartedPage (grid now 2 cols). Replacement trust line APPROVED in copy but placement awaiting founder choice (proposed: trust line beneath stat grid). Only traction figure sitewide (rest are internal admin metrics).
- 51% RULE FORMALLY STRUCK by founder. Intended model = benefactor pays while living; post-transition each beneficiary pays price tied to benefactor's tier — ALREADY IMPLEMENTED via beneficiary_locked_tier (status.py:204-227, plan_map benefactor tier → ben_* plan).
- paired_price VERDICT: dead configuration — read only in status.py:261-272 (returned as API field when estate transitioned), consumed by NOTHING (zero frontend reads; mobile = Capacitor wrapping same frontend). Never used in checkout/charging. Seniors inversion harmless today. Recommend removal (not removed).
- plan_map GAP: missing "seniors" and "new_adult" → their beneficiaries lock to ben_base ($4.99) while catalog displays seniors ben_price $1.99. Display-vs-charge mismatch flagged to founder.
- E2 CORRECTION: expired-trial benefactors do NOT hit the non-dismissible paywall — sdv_only_lockdown (status.py:308 + middleware_subscription_lock.py) keeps dashboard + full SDV; middleware blocks only WRITES on 14 feature prefixes; ALL reads open; /api/compliance/data-export + document downloads + Settings (PrivacyCard export) all reachable when expired. Wind-down export promise = KEPT for expired benefactors (discoverability could improve). require_active_subscription in guards.py is DEAD CODE (never applied to any route).
- Sealed accounts (transitioned benefactor): login refused entirely — cannot export by design; support path exists (support.py:477).
- Section C1 export design + D deferred /pricing build: see chat report. Vercel deploy-hook design approved-in-principle, DEFERRED.
- Footer (Section A): prod platform_settings held 1509 N Scott/889-0017; founder fixed via portal — line1 now canonical (missing comma), line2 missing " USA", **phone STILL (703) 889-0017 — founder must update to +1 (703) 884-1527**. Static prerendered HTML keeps old values until next Vercel rebuild.
- Founder prod password ROTATED (test_credentials.md flagged). No admin API access.
- Atlas query pack delivered to founder for: voiceprint counts, soft-deleted file_data residue, chat_history/BEC counts, trial policy, section_security voice residue. AWAITING RESULTS — Phase 4 purge plan blocked on these.
- Master-key investigation DONE: master key = user support phrase (bcrypt hash), admin unlock removes app-level doc locks only, never decrypts/returns content; no admin endpoint returns file content. Rows 1&4 of 1A table cleared for approval.
- /landing-consumer renders LIVE prod pricing via public plans APIs (LandingPricing.js) — already a de-facto public pricing surface; "30-day free trial" copy ×5 on it.
- /speak-with-us embeds full LandingContent (import) — carries all homepage claims + footer.

## SESSION LOG 4 — CI fix + A2/A3 + D6 paths (Aug 31, 2026)
- CI ruff F821 FIXED (guardian_chat_sessions.py import). check.sh ALL CLEAR — SAFE TO PUSH.
- A2/A3 EXECUTED: dynamic trial copy live in repo (useTrialDays hook; LandingPage ×4, LandingPricing CTA, GetStartedPage ×2, ResetTrialModal button). Verified against trial_days=10 on preview then preview reverted to 30. Prod will show 10 on next deploy (client-side; prerendered HTML stale until Vercel rebuild).
- D6 read/write COMPLETE across ALL transcript surfaces: guardian.py (write, already), guardian_chat_sessions.py (history+titles), guardian_exports.py (2 PDF exports — added), beneficiary_concierge.py (write+history+titles — added). Legacy plaintext passthrough everywhere. E2E-verified decrypt via API + PDF.
- D6 MIGRATION SCRIPT in repo: backend/scripts/migrate_encrypt_transcripts.py (dry-run default, --apply gate, enc_v:1 marker, enc_v:0 for no-estate/no-salt rows). NOT RUN in apply mode. ORDER: deploy code FIRST, then run --apply on Render.
- TTL RECOMMENDATION: Mongo TTL indexes need BSON dates but created_at is an ISO string → recommend a daily janitor (delete transcripts >180d) instead of a TTL index; not implemented, awaiting founder decision.
- B2 EXPORT SECURITY DESIGN delivered (step-up password+OTP, POST not GET, per-user 5/24h limit, audit fields, UI plaintext warning, no-store headers, Sentry scrub). STOP — B1/B3 blocked on founder approval.
- F ONE-LINERS delivered (voice row, paired_price $[] unset, ben_base mislock read-only check) — all validated on preview DB.

## SESSION LOG 4b — full regression + founder decisions (Aug 31, 2026)
- FULL REGRESSION (testing agent, iteration_183): backend 10/10 PASS (enc round-trip, at-rest ciphertext w/ enc_v=1 in Mongo, titles decrypt, both PDFs plaintext, legacy passthrough, dry-run idempotent, site-content, subs/status, data-export, cleanup). Frontend: all trial copy dynamic-30 verified on /landing-consumer + /get-started + admin ResetTrialModal; dashboard/vault/settings smoke OK. Zero critical/minor issues. "Silent login failure" note = expected single-session UX (API 200 + active_session_exists banner, resubmit forces).
- New repo test: backend/tests/test_ega_encryption_regression.py — gated behind RUN_LIVE_EGA_REGRESSION=1 (makes 2 xAI calls; skips in CI and plain pytest runs).
- FOUNDER DECISIONS (BINDING): B2 APPROVED w/ change — step-up channel order: 1) WebAuthn/passkey REQUIRED when enrolled (no downgrade), 2) email OTP otherwise, 3) SMS only if sole enrolled factor (practically never — email always exists). Step-up on EVERY export, no metadata bypass. B2 protections + B1/B3 field inclusion ship in the SAME deploy (next unit of work after migration sequence).
- TRANSCRIPT JANITOR: HOLD (founder) — retention must be disclosed in Privacy Policy at Phase 18 first, then notice, then purge. Design on record: daily janitor deleting transcripts >180d; TTL index impossible today because created_at is ISO STRING not BSON Date.
- EXPORT REMINDER: NO separate email — if shipped, one line inside existing trial-expired notice (build_trial_expired_email, trial_reminders.py:97 "What's still accessible" box). Wording proposed, NOT implemented.
- SEQUENCE (founder E): 1) regression ✔ 2) founder pushes; verify prod frontend+backend 3) founder runs F1,F2,F3 — report outputs 4) prod dry run must show 70 chat_history + 1 BEC — STOP if different 5) --apply 6) full prod E2E verify (API, sessions, both PDFs, BEC history+titles). Migration NEVER before deploy completes.
- Phases 2, 3, 5–23 remain unauthorized. After B2+B1/B3: wind-down 3-state rewrite, then withholding.

## SESSION LOG 5 — B1/B3 + wind-down rewrite EXECUTED (Jun 2026 fork)
- B1/B3 FIELD INCLUSION BUILT + fully regressed (iteration_185: backend 17/17, frontend 16/16; check.sh ALL CLEAR). build_user_export now returns decrypted MM bodies ("messages" key), DAV secret values, financial_picture, entities_structures, contingency_protocols, ffn list, estate_plan_timeline. D1 EXPORT GATE now PASSES — D2 restriction unblock candidate after founder approves/pushes.
- WIND-DOWN 3-STATE REWRITE SHIPPED (founder approved copy + option (a) for decryption card): ZIP claim + IAC-CSV claim removed; States = today / announced wind-down / after last day; "No proprietary formats — ever" card replaces CLI-for-ZIP promise. LandingPage FAQ echo fixed. Footer dated "Last revised: June 2026".
- NEXT (per founder picks): share-card validation after deploy. Withholding gate still UNAUTHORIZED. Register-options struct twin bug still awaiting approval. Transcript migration still awaiting founder Render run.
