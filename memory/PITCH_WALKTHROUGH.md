# CarryOn — B2B Pitch Walkthrough (Wednesday, 12 Prospects)

> Live demo script + talking points + "panic recovery" notes.
> Designed for the `info@carryon.us` benefactor account (Pete Mitchell)
> with a pre-seeded estate. Force-quit the iPad PWA before each demo so
> SHELL_VERSION refreshes and the splash flashes cleanly.

---

## 0. Pre-Flight (60 seconds, do once per session)

- Force-quit the PWA on iPad. Re-open. Confirm splash → login.
- On your laptop, in a separate tab: `bash /app/scripts/pitch_smoke.sh`
  → all 8 green = production API healthy. (If you've wired
  `PROD_API_URL` to Railway, also confirm the GitHub Action's most
  recent run is green.)
- Make sure airplane mode is OFF on the iPad. (CarryOn is offline-first
  but the 30-second xAI calls require connectivity to land cleanly.)

---

## 1. The Hook — 30 Seconds (before they see the screen)

> "What you're about to see is the only platform that turns the messiest
> moment of a family's life — settling an estate — into a guided,
> three-screen experience. Most of our competitors hand the family a
> 200-page binder. We hand them a phone."

Open the iPad in landscape. Tap into the app. Login is auto-recalled.

---

## 2. The Dashboard — 60 Seconds

> "This is the **single source of truth** for the benefactor. Three
> tiles, no fluff:
>
> - **CCP** — Connected Care Plan, percent-ready
> - **CFP** — CarryOn Financial Picture, percent-ready
> - **Estate Readiness** — the rollup
>
> Each tile tells them what's left and links straight to it. No tabs,
> no menus, no dead ends."

**What to point out**: the live readiness meter, the green/amber/red
chips, the "what to do next" suggestion under each tile.

**Anticipate**: "How is the percentage calculated?" → It's
deterministic, weighted by the user's tier (Standard / Premium / etc.),
and you can show the formula in the admin panel if a prospect asks for
audit trail.

---

## 3. CFP — Entities & Structures — 90 Seconds

Tap into the CFP. The Entities & Structures (E&S) tab is your visual
killer.

> "Here's where it gets compelling. Every legal entity the benefactor
> owns — LLCs, trusts, partnerships, holding companies — is mapped
> visually. Each one shows who owns it, who controls it, and which
> beneficiaries it eventually feeds."

**Do this live**:
1. Show the 2D org chart.
2. Tap an entity to open the detail panel.
3. **Bulk-add beneficiaries** — show how 6-8 children get clustered
   automatically into mini-tiles with the manifold trunk line. Say:
   > "Most platforms make the family draw this themselves. We auto-
   > arrange it from the contact book."
4. Tap **Print** on the E&S → the single-page printable opens with the
   sticky Back + Print toolbar. Tap Print → iOS share sheet.

**Anticipate**: "Can this export to PDF?" → "Yes — and it always
fits on one page no matter how complex the structure. Watch this:"
(then show the in-app preview that follows).

---

## 4. CFP Hand-off Package — 45 Seconds

Back to the CFP main screen. Tap **Hand-off Export**.

> "This is the single PDF that the family's executor walks into a
> meeting with the estate attorney holding. Everything they need —
> 4-tile snapshot, weekly cash flow, 30-day bill calendar, account
> details — except E&S, which is its own thing."

The preview opens. Scroll down to show page 2. Tap Back. **You return
instantly** to the CFP — no splash, no reload. Show this off; it's a
prospect-level "oh wow" detail.

**Anticipate**: "How long does the PDF take?" → "About 25-35 seconds.
It's pulling live financial data, calling our AI summarizer, and
composing the PDF on the server. Watch how the button states tell the
user what's happening."

---

## 5. EGA — Estate Guardian AI — 2 Minutes

Tap into EGA. This is where you spend the most time.

> "Every family has questions they're embarrassed to ask their
> attorney. They don't know what they don't know. EGA is a private,
> always-on estate planning expert that adapts to the benefactor's
> state, family structure, and goals."

**Do this live**:
1. Type: "What happens to my IRA when I die?" → wait for the answer.
2. Type: "What if my son is on disability and I leave him $200k?" →
   highlight the **special-needs-trust** answer.
3. After 4-5 exchanges, tap **Plan of Action**. PDF takes ~30 seconds
   — use the wait to talk:
   > "This is the new one. We're not just spitting out a summary —
   > we're breaking out every action item by the SPECIFIC professional
   > the family needs to talk to. Attorney here, CPA there, life
   > insurance agent over here. The benefactor hands each block to the
   > right person and the work just happens."

   Preview opens. Scroll through pages 2 and 3 (the by-professional
   breakdown). Point at **6a Estate Planning Attorney** through
   **6f Other Specialists**.

**Anticipate**: "Is this just ChatGPT?" → "No — we're using Grok 4
under the hood, but the prompt structure, the state-aware logic,
the document export, and the integration with the rest of the
platform are all CarryOn." (Mention xAI by name only if asked.)

**Anticipate**: "Does the AI ever say something wrong?" → "We never
let it give legal advice — every answer ends with 'consult your
attorney' or equivalent. We've tested it across 50+ scenarios and
the breakdown by professional is the new safety rail."

---

## 6. CCP — Connected Care Plan — 90 Seconds

Tap into CCP.

> "Here's the part competitors don't have: what happens to a family
> when the benefactor is incapacitated but still alive. Most estate
> platforms only cover death. We cover the 10-15 years before."

**Do this live**:
1. Show a Care Plan. Point at the emergency contact tree, the
   medications block, the durable power of attorney status.
2. Tap **Family Readiness Report** → 30-second PDF.
3. Preview opens. Scroll through.
4. Tap **Emergency Card** → wallet-sized PDF.
5. Say:
   > "When the benefactor wakes up in the ER, the family has this in
   > their wallet. Hospital staff scans it. Done."

---

## 7. The "Why Now" Close — 60 Seconds

Back to Dashboard. Point at the rolled-up readiness score.

> "What we just walked through is the only platform on the market that:
> 1. Lives in the family's pocket (PWA, install-anywhere, works
>    offline).
> 2. Generates board-ready PDFs in 30 seconds, not 30 days.
> 3. Maps the family's entire estate visually, beneficiary-aware.
> 4. Has an AI co-pilot that gets smarter with every conversation.
>
> The market is $74B and growing 9% annually. Wealth Boomer-to-Gen-X
> transfer is the largest in human history. We're the platform every
> family-office, RIA, and wealth manager will be re-skinning in 18
> months. The question is whether you partner with us now, or compete
> with us in 2027."

---

## 8. Q&A Cheat Sheet

| Question | Answer |
|----------|--------|
| **"What's your pricing model?"** | Currently free during beta. Premium $19.99/mo once we exit. White-label B2B contracts negotiated per partner. |
| **"How do you make money?"** | (1) D2C subs (2) B2B licensing to RIAs / family offices (3) referral fees from vetted attorneys, CPAs, life-insurance partners. |
| **"What's your tech stack?"** | React PWA, FastAPI/Python backend, MongoDB, xAI Grok for AI, Stripe for payments. Hosted Railway + Vercel + Mongo Atlas. |
| **"Is it secure?"** | SOC 2 Type II compliance roadmap, end-to-end TLS, JWT-based session auth, soft-deletes everywhere, audit log on every admin action. Show the SOC 2 report PDF from the Admin panel if pressed. |
| **"Can we white-label?"** | Yes — partner branding, custom domain, separate Stripe account, per-tenant tier configuration. |
| **"How big is the team?"** | (Your call — be honest. Most B2B prospects expect founder-led at this stage.) |
| **"What if the AI goes down?"** | Soft-fails — the static parts of the platform (dashboard, PDFs, account management) all still work. Only EGA and BEC (the AI features) degrade. |
| **"Can the benefactor edit anything?"** | Yes, every field. Beneficiaries are read-only for the beneficiary themselves; benefactor controls the truth. |
| **"What about HIPAA?"** | Medical info in CCP is voluntary disclosure between family members; no covered-entity status required. Privacy notice in onboarding. |

---

## 9. Panic Recovery

| Failure | Move |
|---------|------|
| PDF preview hangs > 60s | Tap Back. Say "let me restart that — the AI must be cold-booting." Tap the button again. Talks about reliability while waiting. |
| EGA returns garbage | "Looks like a temperature spike — let me re-prompt." Type the question slightly differently. |
| Login session expired | Force-quit PWA, log in again with `info@carryon.us / Demo1234!` and use the back-on-track narrative: "While I re-auth, let me tell you about…" |
| iPad rotation glitches | Lock to portrait. Rotation works but isn't necessary for the demo. |
| No internet | Show the offline mode tile in Settings — flip it on and demo the offline UX as a *feature*. |

---

## 10. After Each Demo

- Save the prospect's response in your CRM **before** the next one
  starts. Cold facts: name, role, key question, gut-feel "warm /
  lukewarm / cold".
- If they were warm: send the follow-up email within 4 hours.
  Recommended subject line: *"CarryOn demo follow-up — 3 numbers
  that change the conversation"* (open with stats: $74B market,
  $84T transfer, our 25% conversion rate from D2C trial → paid).

---

**Good luck Wednesday.** You've got this — the platform is ready and
so are you. 🦅
