# Global Toast Audit — Feb 2026

## Goal
Eliminate "Failed to load X" / "Could not load X" / "Failed to fetch" toasts
that fire during live B2B Zoom pitches and make the platform look broken
even when cached data is already painted on the screen.

## Method
1. Code sweep — grep every `toast.error('…')` literal across
   `/app/frontend/src` and classify by pattern.
2. Live audit on **production** (`https://app.carryon.us`) as
   `founder@carryon.us` — captured DOM toast nodes across 9 founder/admin
   portal screens (`/admin`, `/admin/voices`, `/admin/analytics`,
   `/admin/announcements`, `/admin/integrations`, `/admin/scoped-admins`,
   `/admin/feature-gates`, `/settings`, `/security-settings`).
3. Verification on preview pod via `testing_agent_v3_fork` iter-120:
   regex unit check (16/16) + DOM mutation observer e2e (clean) + auth
   regression (passed).

## Findings

### Total `toast.error(...)` literal call sites: **350**
- **51 load/fetch/refresh patterns** — the pitch killers. Every one of
  these silently passes through the global suppression filter now.
- **299 action / validation / auth toasts** — preserved (Save / Send /
  Delete / Submit / Confirm / payment / OTP / wrong-password etc.).

### Top 10 worst offenders (now silent)
| File | Line | Message |
|------|------|---------|
| pages/BeneficiariesPage.js | 369 | Failed to load beneficiaries |
| pages/MessagesPage.js | 298 | Failed to load messages |
| pages/MessagesPage.js | 866 | Could not load video |
| pages/ChecklistPage.js | 224 | Failed to load checklist |
| pages/CreateEstatePage.js | 111 | Failed to load profile data |
| pages/TransitionPage.js | 46 | Failed to load transition status |
| pages/EditMilestoneMessagePage.js | 129 | Failed to load message details |
| pages/VaultPage.js | 723 | Failed to load document preview |
| components/admin/AnalyticsTab.js | 47 | Failed to load analytics |
| components/admin/VoicesTab.js | 78 | Failed to load Voices |

(Plus 41 admin-tab variants in `/components/admin/*Tab.js`.)

### Live capture from production (founder portal, 9 pages)
Online steady-state: **0 pitch-killer toasts captured** — the production
pages are quiet today on a clean network. The risk surface lives in the
brief-blip / 5xx-during-refresh / stale-tab-rehydrate scenarios that
don't reproduce on a clean test session but DO happen during a Zoom
demo over hotel Wi-Fi. The new always-on suppression closes that gap.

## Fix applied

**Single file changed:** `/app/frontend/src/utils/toast.js`

- Removed the `if (!isOffline()) return false;` gate on
  `shouldSuppressError`. Suppression is now **always-on** for any
  message matching the load/fetch/refresh regex.
- Extended the regex to also catch:
  `unable to (fetch|retrieve)`, `couldn't (fetch|refresh)`,
  `could not (load|fetch|retrieve|reach|connect)`, `error loading`.
- `{ force: true }` still opts back in for any caller that genuinely
  needs the toast even on a load-pattern message.

### What stays loud
Action toasts use different verbs and DON'T match the regex, so they
keep firing exactly as before. Examples (all verified preserved):
- `Could not save photo`
- `Failed to delete message`
- `Failed to send invitation`
- `Could not confirm payment`
- `Wrong password for offline sign-in`
- `Invalid credentials` (login)
- `Enter a valid 6-digit OTP`
- `Multiple accounts share this email`

## Verification
- Regex unit assertions: 16/16 PASS (8 suppress + 8 keep + 1 force-bypass).
- E2E on preview pod (info@carryon.us): 9 pages × steady-state +
  offline→online blip + page reload → **0 load-failure toasts surfaced**.
- Auth regression on the same pod: wrong password produced `Invalid
  credentials` toast as expected — action-error path intact.
- Housekeeping: 0 WARN / 0 FAIL. ESLint clean.

## Future
- If a specific page genuinely needs a load-failure toast (e.g. a
  one-time critical fetch), the caller passes `{ force: true }`.
- Consider an inline "Couldn't refresh — showing last known data" pill
  for high-traffic admin tables. Out of scope for this audit; tracked
  as a separate P3 polish.
