# CarryOn™ — Agent Rules (Persistent Across Forks)

> **This file exists to survive agent forks.** When a new agent picks up a job,
> these rules apply without having to be re-stated by the user. Read this
> BEFORE starting any task.

---

## 🛑 RULE -3 — CRITICAL PATHWAYS ARE INVIOLATE.

**Added Feb 5, 2026 after an agent silently deleted the Beneficiary Hub
("Estate Plan Network" orbit view) — a CENTRAL platform pathway —
based on a misread user mandate. Required emergency restoration.
Founder's verbatim response: *"THIS CAN NEVER HAPPEN AGAIN!!!! THIS IS
A CRITICAL PATHWAY THAT IS CENTRAL TO THE PLATFORM!!!"***

### What is a critical pathway?

A pathway whose disappearance breaks a core user flow. They are
enumerated in `housekeeping.sh` under the `CP. Critical Pathway
Invariants` section as `cp_check` lines. Every check in that section
is a **FAIL** (not a warning). Any push that breaks one is blocked.

### Current critical pathways

1. **Beneficiary Hub (Estate Plan Network orbit)** — `BeneficiaryHubPage`
   at `/beneficiary`. User-in-center, benefactors arrayed on rings 0–3
   keyed to family relation via `getOrbitLevel`. Reachable from:
   - Sidebar **"My Beneficiary Portal"** button (`switch-beneficiary-portal`)
   - MobileNav **"My Beneficiary Portal"** button (`mobile-switch-beneficiary`)
   - FamilyTree estate-node click on the Benefactor Dashboard
   - Direct URL `/beneficiary`
   - **"All Estates"** back button (`back-to-all-estates`) on any specific
     estate's `/beneficiary/dashboard`
   The hub uses the `OrbitVisualization` component and the
   `/api/beneficiary/family-connections` endpoint. Tapping any benefactor
   avatar OR estate tile → `openEstate(id)` → `/beneficiary/dashboard`
   → `BeneficiaryDashboardPage` renders pre or post-transition content
   inline via `BeneficiaryPreTransitionPanel`.

### Hard rules

- **Do not delete**, rename, or "consolidate" any critical-pathway
  component, route, button, or back-affordance without an EXPLICIT,
  unambiguous user instruction naming the specific pathway.
- A user complaint about *behaviour* on a pathway (e.g. "the back button
  doesn't work", "this page is empty when I have no data") is **NEVER**
  a license to delete the pathway. Fix the behaviour. The pathway stays.
- Before *any* edit to `App.js` route definitions, `Sidebar.js`,
  `MobileNav.js`, `FamilyTree.js`, or any file under
  `pages/beneficiary/`, **run `bash /app/housekeeping.sh`** first AND
  again after the edit. The CP block must report 0 FAIL both times.
- If you genuinely believe a pathway needs to be removed: ask the user
  explicitly with the pathway's full name, wait for a verbatim
  confirmation, then update both `housekeeping.sh` (remove the
  cp_check) and this file (remove the entry) in the same commit.

### Adding a new critical pathway

When the user designates another pathway as critical, append:
1. A new `cp_check` line in `housekeeping.sh` (under the `CP.`
   section), pointing at a stable identifier in the source code
   (e.g. a `data-testid`, route path, or component import).
2. A bullet in the "Current critical pathways" list above with the
   reachable entry points and key components.

---

## 🚨 RULE -2 — DO NOT RENAME OR PARAPHRASE PLATFORM FEATURES.

**Added Apr 29, 2026 after the agent fabricated cute marketing names like
"Family Forever Network" and "Connected Care + Financial Portals" on the
public landing page instead of using the actual feature names.**

The user's response (verbatim):
> *"It looks like you allowed yourself to have some hallucinations and fun
> naming each feature in my platform! In the landing page, you just created,
> you need to immediately both change the names and make sure the narrative
> for each feature is perfectly aligned with what the feature actually does!"*

### The Nine Pillars of Family Readiness — canonical names

This is the source-of-truth taxonomy. Every public-facing surface (landing
page, marketing site, og tags, schema.org, app store listings, press kit,
investor deck, support docs) MUST use these EXACT names — including the
parenthetical abbreviations and the `™` on Estate Guardian — in this
exact order.

| # | Canonical Name | Abbr | Notes |
|---|---|---|---|
| 01 | Milestone Messages | MM | CORE |
| 02 | Secure Document Vault | SDV | CORE |
| 03 | Estate Guardian™ AI | EGA | (TM mark required) |
| 04 | Immediate Action Checklist | IAC | CORE |
| 05 | CarryOn Contingency Protocols | CCP | |
| 06 | Estate Communications Tool | ECT | (sometimes "Estate Comms" in compact UI; full name on marketing) |
| 07 | Digital Access Vault | DAV | |
| 08 | Family & Friends Notification | FFN | |
| 09 | CarryOn Financial Picture | CFP | |

Foundational element (NOT a pillar — do not list as a feature):
- **Beneficiaries** — the platform's foundational primitive, not a feature.

Out-of-scope for launch (per user, Apr 29, 2026):
- Designated Trustee Services (DTS) — exists in product, NOT to be advertised on launch landing.
- Estate Plan Timeline — exists in product, NOT to be advertised on launch landing.

### Source-of-truth file

`/app/frontend/src/components/landing/LandingContent.js` — `PILLARS` array.

If marketing copy needs to change, change it in `LandingContent.js`
FIRST, then mirror to `LandingPage.js` (the SEO landing). Do NOT
paraphrase, summarize, or "improve" the descriptions when copying.

### Hard rules

1. **Never rename a feature.** Not "Estate Guardian Assistant," not
   "Family Forever Network," not "Important Account Checklist," not
   "Connected Care + Financial Portals." If you see a name that doesn't
   match the table above, it's wrong.
2. **Never invent marketing blurbs.** If the user asks for landing copy,
   pull the `bold` + `desc` fields from `LandingContent.js` verbatim. If
   they don't exist, ASK the user — don't write your own.
3. **Never list "Beneficiaries" as a feature.** It's the platform's
   foundational concept.
4. **Never list DTS or Estate Plan Timeline on launch-facing surfaces**
   without explicit user approval — they exist in the product but are
   intentionally omitted from the launch story.

---

## 🛑 RULE -1 — STOP HALLUCINATING. STOP DOING WORK THE USER DIDN'T ASK FOR.

**Added Apr 29, 2026 after a session where the agent went off the rails
suggesting and shipping work the user did not request.**

User's words (verbatim across two messages):
> *"It honestly sounds like you're going off the rails here. … This is
> pure hallucination. … Stop suggesting things stop recommending things
> and let me drive going forward until I tell you otherwise."*

> *"I feel like you are hallucinating a lot recently and jumping and doing
> things that I don't want you to do."*

### Operating rules — apply to every interaction with this user:

1. **No unsolicited "Potential improvement" / "want me to also…" lines.**
   The system prompt encourages a closing enhancement pitch in `finish`
   summaries — that pitch is **OFF for this user**. Ship the requested
   work, summarize what was done, stop.

2. **Do not infer intent.** If a request is ambiguous, ask one crisp
   question and wait. Do not pick a "reasonable default" and ship it.

3. **Do not extrapolate scope.** If the user says "remove X from
   screen Y", remove X from screen Y. Do not also remove it from
   screen Z, do not also delete the backing endpoint, do not also
   rename the file. Stay literal.

4. **Do not touch admin-only / Founder Portal surfaces unless the user
   explicitly asks.** The Founder Portal is the user's tooling, not a
   feature surface for benefactors. Default-hide new features there.

5. **Do not modify production data, DB feature gates, tier toggles,
   admin settings, or anything the user controls via their own UI.**
   User's words: *"features should only appear in each tier level as
   dictated by what I toggle on or off for each tier in my ADMIN
   founder portal."* When you find a config that "looks wrong", flag
   it and stop — do not "fix" it.

6. **When the user pushes back, stand down completely.** Don't justify,
   don't re-pitch, don't end with "want me to do X instead?".
   Acknowledge in one or two lines and wait. The user explicitly said:
   *"let me drive going forward until I tell you otherwise."*

7. **Database awareness.** This preview pod has its OWN MongoDB. Data
   here (estate counts, user lists, demo accounts) is NOT the user's
   production data. Never assume the preview state matches what the
   user sees. The user's words: *"your database lives inside of your
   Preview and my database lives in the real world."*

---

## 📦 RULE -0.5 — GitHub pushes are slow (open issue, do NOT fix proactively)

The user's "Save to GitHub" flow runs slowly after each session. This is
recorded here for visibility but **must not be acted on without
explicit instruction**. When the user gives the go-ahead, candidate
investigation areas (in priority order):
- Large binary assets in `/app/frontend/public/`, `/app/customer-assets`.
- Generated files committed by mistake (node_modules, coverage, automation
  screenshots in `/root/.emergent/automation_output/`, etc.)
- Long binary-churned `.git` history — `git gc` may help.
- The Emergent platform's `Save to GitHub` pipeline itself (out of agent
  scope — route to `support_agent` if the user asks).

---

## 🔴 RULE 0 — Housekeeping runs after EVERY batch of changes. No exceptions.

**This is the prime directive. It was violated repeatedly by previous agents and
caused production regressions. Do not be that agent.**

Run `bash /app/housekeeping.sh` after **every single batch of changes** —
not just at the end of a task, not just before calling `finish`, but after
every set of file edits before moving to the next task.

The correct workflow is:
1. Make changes
2. `bash /app/housekeeping.sh` → must show 0 WARN, 0 FAIL
3. Fix anything it flags
4. Only then move to the next task or respond to the user

**Why:** Skipping this means broken code accumulates silently across iterations.
The user discovered this pattern and explicitly asked how to prevent it.
The answer is: you run housekeeping every time, without being told to.

```bash
# After EVERY batch of changes:
bash /app/housekeeping.sh 2>&1 | grep -c "PASS"    # must be 69
bash /app/housekeeping.sh 2>&1 | grep "WARN\|FAIL"  # must be empty
bash /app/scripts/check.sh 2>&1 | tail -3           # must say ALL CLEAR
```

---

## 🔴 RULE 1 — Every summary includes a full housekeeping + ruff report

**No exceptions.** Before calling the `finish` tool, the agent MUST run:

```bash
bash /app/scripts/check.sh          # if scripts/check.sh exists
# OR fall back to:
cd /app/backend && ruff check . && ruff format --check .
bash /app/housekeeping.sh
```

And the summary MUST include a section formatted like this:

```
## Housekeeping + Ruff Report

| Check | Result |
|---|---|
| ruff check (<N> files) | ✅/❌ |
| ruff format --check (<N> files) | ✅/❌ |
| Housekeeping (65 checks) | ✅/❌ summary |
| scripts/check.sh pre-push gate | ✅/❌ ALL CLEAR / N BLOCKING |
```

If any check is failing at summary time, the agent MUST say so honestly, not
hide it. Fix-before-finish is preferred.

**Why**: the user has been burned by CI failures from unformatted code. They
don't want to remember to ask — they want it reported automatically.

---

## 🔴 RULE 1b — Housekeeping WARNs must be FIXED, not reported (Apr 17, 2026)

**The housekeeping script exists to fix things, not surface them.** Any
`WARN` or `FAIL` line emitted by `bash /app/housekeeping.sh` or
`bash /app/scripts/check.sh` MUST be resolved before calling `finish` —
regardless of whether the issue was introduced in the current session
or predates it.

- Do not hand the user a summary containing unresolved WARNs.
- Do not rationalize ("pre-existing", "out of scope", "low priority"):
  the whole point of the gate is zero-noise pushes.
- If a WARN genuinely cannot be fixed (e.g. requires user credentials,
  3rd-party config), escalate explicitly in the summary and ask what
  the user wants done — do not silently leave it.

Common fixes:
- **Mongo projection safety**: add `"id": 1` to inclusion projections.
- **Min font size (11px)**: bump any `text-[10px]` / `text-[9px]` etc.
  to `text-[11px]` minimum — Apple accessibility review rejects below that.
- **ruff format**: run `cd /app/backend && ruff format .`.
- **Frontend lint errors**: run `cd /app/frontend && yarn lint:errors`.

**Why**: the user explicitly stated "I didn't have you build the
housekeeping script for you to simply identify things, it is meant for
you to identify AND FIX things before I push." Logged Apr 17, 2026.

---

## 🔴 RULE 2 — Preserve ALL functionality on EVERY change

**No exceptions.** The user has repeatedly emphasized: "MAKE SURE THAT NO
FUNCTIONALITY IS LOST WHATSOEVER!"

- Never refactor unrelated code
- Never delete components, routes, or endpoints without explicit approval
- Always use `search_replace` over `create_file` when editing existing files
- When in doubt, ADD rather than REPLACE

---

## 🔴 RULE 3 — Respond to the user in English

The handoff summary may specify other preferences but the user's baseline
preference is English.

---

## 🟡 RULE 4 — User has zero coding experience

- When giving user-facing instructions, write like they've never opened a terminal
- "Click this button, paste this exact text, wait for X"
- Don't assume knowledge of git, CI/CD, env vars, etc.
- Point to `/app/memory/LAUNCH_DAY_OPERATOR_GUIDE.md` for any operational task

---

## 🟡 RULE 5 — Certain architectural decisions are LOCKED

These have been debated, fixed, and should not be revisited without explicit
user approval:

1. **iOS chat keyboard** uses `position: fixed; inset: 0; overflow: hidden` with
   ZERO `visualViewport` manipulation. See prior handoff notes. Recurrence
   count: 20+. DO NOT REWRITE.

2. **Per-estate AES-256-GCM + 600k PBKDF2** is locked. Don't weaken for perf.

3. **JWT + MongoDB-backed rate limiter + distributed scheduler lock** is the
   current infrastructure baseline. Don't replace with Redis without the user
   explicitly asking for Redis.

4. **emergentintegrations** is installed from
   `https://d33sy5i8bnduwe.cloudfront.net/simple/` via `--extra-index-url` in
   `backend/requirements.txt`. Don't try to find it on public PyPI.

5. **Subscription schema** has `founders_circle`, `user_subscriptions`,
   `subscription_overrides`, `payment_transactions` collections. Don't
   consolidate them.

---

## 🟢 RULE 6 — Update test_credentials.md whenever auth changes

From the system prompt. Surfaced here because it gets forgotten.

---

## 🟢 RULE 7 — Hard commitments from the user, logged

- Launch: **nationwide social media campaign ~1 week from 2026-04-16**
- Blocked 3rd parties: **Apple Paid Applications Agreement, Twilio A2P 10DLC**
- Dollar sunk cost: **~$60K** (context for scope decisions)
- Technical experience: **zero coding background** — explanations must be plain

---

## How to extend this file

Add new rules numbered and prefixed with severity:
- 🔴 HARD RULE (no exceptions)
- 🟡 STRONG PREFERENCE (deviate only with explicit approval)
- 🟢 REMINDER (good practice)

Keep existing rules intact — they represent accumulated trust.

---

## 🔴 RULE 8 — Every tile/modal/sheet MUST fit on ALL mobile screen sizes (Apr 28, 2026)

**User's exact words:** "A PRD item going forward needs to be that whatever tile you
create must always scale to every mobile size screen, from an iPhone 13 mini to an
iPhone 17 Pro Max, and always be centered between the bottom edge of the logo and
hamburger menu bar and the top edge of the dock."

**Enforcement rules:**
- ANY new modal, sheet, drawer, or panel MUST apply:
  ```css
  max-height: calc(100dvh - 64px - 80px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  /* 64px = header bar, 80px = dock */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  ```
- The header/title row of the tile MUST be `flex-shrink: 0` (never scrolls away)
- The content area below the header MUST be `overflow-y: auto; flex: 1`
- `WebkitOverflowScrolling: touch` and `overscrollBehavior: contain` on the scroll area
- The backdrop/overlay MUST use `paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 80px)` on mobile to clear the dock
- Images or media previews inside a tile MUST use `maxHeight: min(200px, 45vw)` on mobile to leave room for controls

**Target devices (minimum support):**
- iPhone 13 Mini: 375 × 812 px — ~584px of usable tile height
- iPhone 16: 393 × 852 px — ~620px of usable tile height  
- iPhone 17 Pro Max: ~440 × 956 px — ~730px of usable tile height

**Why:** Discovered Apr 28, 2026 when the SocialShareSheet was clipped at the bottom on compact iPhones because it had no `maxHeight` constraint and no internal scroll.


---

## 🟡 RULE 9 — Revenue-funnel Playwright E2E activation path (Feb 14, 2026)

**Why this rule exists:** We added `/app/frontend/tests/e2e/signup_invite_flow.spec.js`
which exercises the full signup → paywall → Stripe checkout → post-payment dashboard
funnel. It is currently EXCLUDED from `yarn e2e:prod-safe` because it requires a
live Stripe test mode key and a staging URL. Once those exist, flipping the switch
gives us launch-grade regression coverage on every PR and is the single highest-ROI
safety net before the App Store cutover.

**Activation procedure (for the agent, when user says "turn on revenue tests"):**

1. Confirm a staging environment exists with:
   - `STRIPE_SECRET_KEY=sk_test_...` and `REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_...`
   - Seeded test user in `/app/memory/test_credentials.md` under "Playwright Revenue Funnel"
2. In GitHub → Repo → Settings → Secrets and variables → Actions → Variables tab,
   set `RUN_E2E` to `true` (not a secret; it's a boolean flag gate in `ci.yml`).
3. In the same screen, under Secrets tab, add:
   - `E2E_BASE_URL` → the staging URL (e.g. `https://staging.carryon.us`)
   - `E2E_TEST_USER_EMAIL` / `E2E_TEST_USER_PASSWORD`
   - `E2E_STRIPE_TEST_CARD` (default: `4242 4242 4242 4242` — card number can be
     hardcoded in the spec, this var is for edge-case cards like 3DS)
4. Update `package.json` script (already present) so `yarn e2e:prod-safe` drops the
   `--grep-invert 'Revenue funnel'` flag, OR add a new `yarn e2e:revenue` that runs
   only that spec on a schedule.
5. Re-run `bash /app/housekeeping.sh` and `yarn e2e` locally against staging to
   confirm the spec is green BEFORE merging the CI change.

**Do NOT** run the revenue spec against `app.carryon.us` production — it creates a
real user and a real (test-mode) Stripe customer. Always point it at staging.



---

## 🎨 SETTINGS UI PRIMITIVES — Use these, do not re-invent

When building or touching Settings-page cards (or any card-like UI with a
primary CTA), **always** use the shared primitives in `frontend/src/index.css`.
Hand-rolling `bg-[var(--gold)] disabled:opacity-50` etc. creates the muted,
unreadable state that regressed twice before these primitives existed. Don't
be the agent who brings it back.

### `.btn-gold-cta` — primary Save / Apply action
- **Enabled**: solid gold fill (`var(--gold)`), navy text (`#0b1120`).
- **Disabled**: outlined gold pill (transparent bg, gold border + gold text,
  no opacity change). Stays fully legible on both white (light) and navy
  (dark) card surfaces.
- **Usage**:
  ```jsx
  <button
    disabled={saving || noChange}
    className="px-4 py-2 rounded-md text-sm font-semibold btn-gold-cta"
  >
    Save
  </button>
  ```
- **Never** combine with `bg-*`, `text-*`, `border-*`, or `disabled:opacity-*`
  Tailwind utilities — they'll fight the class.

### `.btn-outline-cta` — secondary Cancel / Dismiss action
- Transparent bg, `var(--t)` text, soft 28%-alpha border. Hover lifts to
  50% alpha + subtle tint.
- **Usage**:
  ```jsx
  <button className="px-4 py-2 rounded-md text-sm btn-outline-cta">
    Cancel
  </button>
  ```
- Pairs visually with `.btn-gold-cta` for primary/secondary action rhythm.

### `.select-themed` — theme-aware `<select>` caret
- Strips the native stepper arrows (iOS Safari draws them black-on-black in
  dark mode — a persistent regression) and paints a double-chevron SVG in
  cream (dark mode) or slate (light mode).
- **Usage**:
  ```jsx
  <select className="select-themed w-full h-9 px-3 rounded-md bg-[var(--card)] border border-[var(--b)] text-[var(--t)]">
    {/* options */}
  </select>
  ```
- Safe to stack with Tailwind utilities; `.select-themed` only sets
  `appearance: none` + `background-image` + `padding-right`.

### If you need a new primitive
Add it to `frontend/src/index.css` in the "Settings UI primitives" block,
document it here with an enabled/disabled spec, and ensure it works in
BOTH themes before using it. CSS variables: use `var(--gold)`, `var(--t)`,
`var(--bg)`, `var(--card)` — never hardcode `#0F1629` etc. (light mode
will be unreadable).

---

## 📜 MOBILE SCROLLBAR INVARIANTS — Native scroll only

Custom JavaScript scrollbars on mobile viewports are **permanently retired**.
Previous attempts (`ScrollBar.js`, `PageScrollBar.js`, pointerdown drag
handlers) caused at least 4 distinct user-visible regressions on iOS
Safari — thumb direction inverted, text selection glitches, flex-box
z-index bugs, ratcheting scroll position — before we ripped them all out.

### Rules
1. **Do not create** any `ScrollBar*.js` / `Scrollbar*.js` / `PageScrollBar*.js`
   component file. Housekeeping H1 fails the run if one appears.
2. **Do not modify** the global `*::-webkit-scrollbar { display: none }`
   rule in `frontend/src/index.css`. It's the reason iOS no longer shows
   the ugly native gutter indicator. H2 verifies it's still there.
3. **Do not hand-roll** pointerdown-based scroll drag handlers that
   manipulate `scrollTop` directly. H3 fails the run. If you genuinely
   need a visible scrollbar on desktop, use `useOverlayScrollbars()`
   (already installed) — it's the only sanctioned scrollbar lib.
4. **Existing `useOverlayScrollbars` callers** (`EstateChatPage.js`,
   `DashboardLayout.js`) are desktop-only by render path. Don't introduce
   new mobile-only call-sites.

If a user asks for a custom mobile scrollbar: push back. Share the
handoff history — it's been tried, it's been regressed, native scroll

---

## 🪝 GIT HOOKS — One-time install per clone

The repo ships with two invariant-enforcing git hooks at
`scripts/git-hooks/`. Running `bash scripts/setup-dev.sh` once wires both:

- **`pre-commit`**: auto-fixes safe lint/format issues, re-stages them,
  and blocks the commit if unfixable issues remain.
- **`pre-push`**: runs `bash /app/housekeeping.sh --strict` — blocks any
  push that would introduce a regression in Sections G (Settings UI
  primitives) or H (mobile scrollbar invariants), plus all other WARNs
  and FAILs. Prints a friendly remediation message when it blocks.

### Install
```bash
bash scripts/setup-dev.sh
```

### Verify
```bash
git config core.hooksPath   # should print: scripts/git-hooks
```

### Emergency bypass (do NOT make this a habit)
```bash
git push --no-verify
```

If you bypass a block and push anyway, the regression WILL be caught by
the CarryOn CI pipeline on GitHub — it just means a slower feedback loop
and a noisier branch status. Local hook is the courteous first line.

won. Offer desktop-only scrollbar visibility instead, which is what the
current setup already provides via `@media (min-width: 1024px)`.



────────────────────────────────────────────────────────────────────
RULE: React Hook Dep TDZ — never reference later-declared consts
────────────────────────────────────────────────────────────────────

NEVER write a useEffect / useMemo / useCallback / useLayoutEffect
whose dependency array references a `const` or `let` that is declared
LATER in the same component function body.

Example of the bug (took prod down once already):

    useEffect(() => { ... }, [canvasW, canvasH]); // ← reads here
    const { canvasW, canvasH } = useMemo(...);    // ← declared after

Why it bites: works in dev (closure reads `canvasW` only when the
effect later runs), but the minified production bundle evaluates the
deps array synchronously during render. The `const` is in JavaScript's
Temporal Dead Zone at that point, so it throws

    ReferenceError: Cannot access 'P' before initialization

(where 'P' is the minified rename of `canvasW`). The whole React tree
crashes into the global error boundary.

PREVENTION:
  • Always declare the `const`/`let` BEFORE any hook that references it.
  • Reorder useMemo/useCallback blocks so producers come before consumers.
  • If two values are mutually dependent, refactor — don't paper over it.

ENFORCEMENT:
  • housekeeping.sh check 3b runs /app/scripts/check_hook_dep_tdz.py
    after every push and fails if any hook deps reference a later-
    declared const.
  • Run manually: `python3 /app/scripts/check_hook_dep_tdz.py
    /app/frontend/src`


────────────────────────────────────────────────────────────────────
RULE: Never put two `style=` (or `className=`) attrs on the same JSX
────────────────────────────────────────────────────────────────────

React silently keeps only the LAST attribute when a JSX element has
duplicate `style={...}` or `className={...}`. Every property in the
earlier object is dropped without warning. The first symptom is a
layout that works in dev but breaks on iOS PWA / production because
critical inline styles (min-height, touch-action, overflow modes,
padding, z-index) silently vanish.

Bug pattern that shipped once:

    <div
      className="flex-1 overflow-y-auto"
      style={{ minHeight: 0, touchAction: 'pan-y' }}    // ← dropped
      style={{ paddingBottom: 'calc(...)' }}            // ← wins
    >

PREVENTION:
  • Always merge into a single style / className.
  • If you need to add styles to existing ones, edit the existing
    object — don't append a second attribute.

ENFORCEMENT:
  • housekeeping.sh check 3c runs /app/scripts/check_jsx_duplicate_attrs.py
    after every push and fails if any duplicate style/className exists.
  • Run manually: `python3 /app/scripts/check_jsx_duplicate_attrs.py
    /app/frontend/src`
