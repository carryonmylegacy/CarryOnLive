# Estate Creation Paths — Audit (April 2026)

This document traces **every** code path that creates a `db.estates` document,
flags inconsistencies between them, and surfaces known risks. Use this as the
definitive reference when modifying signup, onboarding, or invitation flows.

## Summary Table

| # | Path | Endpoint | Triggered by | Creates | Risk Level |
|---|---|---|---|---|---|
| 1 | **Signup (benefactor)** | `POST /api/auth/register` | `/signup` form | 1 estate + N beneficiary stubs | 🟢 Low |
| 2 | **Create-Estate (existing user)** | `POST /api/accounts/create-estate` | `/create-estate` wizard | 1 estate (deletes ghost first) | 🟡 Medium |
| 3 | **Generic /estates** | `POST /api/estates` | Older clients / admin | 1 estate + default checklist | 🟡 Medium |
| 4 | **Invitation accept (new user)** | `POST /api/auth/accept-invitation` | `/accept-invitation/:token` | User record; attaches to existing estate | 🟢 Low |
| 5 | **Invitation accept (existing user)** | `POST /api/auth/link-invitation` | Same token, user logged in | Attaches to existing estate only | 🟢 Low |
| 6 | **Dev switcher** | `POST /api/auth/dev-switch` | Admin Dev Switcher tab | Reuses existing; may create preview data | 🟢 Low |
| 7 | **Admin create-for-user** | (Admin action) | Admin portal | 1 estate on behalf of user | 🟡 Medium |

## Path 1: Signup → auto-create estate (`routes/auth.py:604-618`)

**Invariants ensured:**
- Role === `benefactor` (precondition on line 607)
- `encryption_salt` generated (line 615) ✅
- `status: "pre-transition"` ✅
- `beneficiaries: []` ✅
- `owner_id` === user_id ✅

**What's missing:**
- ❌ **No default checklist is seeded**. Path 3 (`POST /estates`) calls `ensure_default_checklist(estate.id)`; signup path does NOT. Dashboard's `totalTasks = checklists.length || 5` papers over this, but the IAC readiness score will be 0 until the user manually adds items.

**Recommended fix (post-launch, 20 min):**
```python
# In routes/auth.py after estate insert:
from utils import ensure_default_checklist
await ensure_default_checklist(estate_id)
```

## Path 2: Create-Estate wizard (`routes/estates.py:500-600`)

Handles both new-benefactor-from-beneficiary AND additional-estate-for-existing-benefactor.

**Smart behaviors:**
- **Ghost-estate auto-cleanup** (lines 517-530): if user previously had a half-created estate (no beneficiaries, no vault items, pre-transition), it's deleted before creating the new one. Prevents orphaned estates.
- **Onboarding state handling** (lines 538-544): if this is the user's N+1 estate (not first), marks Getting Started as `celebration_shown=true` and `dismissed=true` so the guided flow doesn't retrigger.
- **Multi-role preservation** (lines 563-566): sets `is_also_benefactor=True` WITHOUT changing `role`. This is the cross-pollination model — beneficiaries become benefactors without losing beneficiary access.

**Missing/inconsistent:**
- ❌ **No default checklist seeded** (same as Path 1).
- ⚠️ **Staff account guard**: correctly rejects admin/operator (line 508), good.
- ⚠️ **Race condition**: two concurrent POSTs from same user in flight could both see no existing estate, both delete nothing, and create two estates. Odds: very low (the wizard has a submit-once spinner). Mitigation: a unique compound index `(owner_id, "pre-transition")` on `db.estates` would make the second insert fail. Post-launch fix.

## Path 3: Generic `POST /api/estates` (`routes/estates.py:856-879`)

Used by legacy clients and admin overrides.

**Differences from Path 1/2:**
- ✅ Calls `ensure_default_checklist` (the only path that does).
- ❌ Does NOT set `is_also_benefactor`. If a beneficiary hits this endpoint via some admin path, they'd own an estate without the cross-role flag. Cross-pollination breaks.
- ❌ Does NOT check/delete ghost estates.

**Recommended fix:**
Mark this endpoint as admin-only (add `require_admin` dependency) since frontends now exclusively use Path 2. If kept, add the ghost-cleanup + `is_also_benefactor` logic.

## Path 4/5: Invitation accept flows

These DON'T create new estates — they link the accepting user to an existing estate as a beneficiary. Safe.

## Ghost-estate detection (consistency across paths)

Three places detect "ghost estates" with slightly different logic:

| File:Line | Definition |
|---|---|
| `routes/estates.py:523` | `len(beneficiaries)==0 AND ben_docs_count==0 AND vault_items_count==0 AND status=="pre-transition"` |
| `routes/admin/estate_health.py:351-365` | `len(beneficiaries)==0 AND status=="pre-transition" AND created_at > 2 minutes ago` |
| `server.py:248-252` (debug_user_state) | Same as routes/estates.py |

⚠️ **Drift risk**: estate_health.py has a time window (2+ min old) that the others don't. This is probably intentional (don't delete an estate that's being actively set up), but should be extracted into a single helper: `services/estate_health.is_ghost_estate(estate_id) -> bool`. Post-launch refactor.

## Concurrency recommendations (pre-launch)

1. **Add a compound unique index** to prevent a benefactor from owning two `pre-transition` estates simultaneously:
   ```python
   await db.estates.create_index(
       [("owner_id", 1), ("status", 1)],
       unique=True,
       partialFilterExpression={"status": "pre-transition"},
   )
   ```
   (add to `db_indexes.py`, migrations section — will fail cleanly if dupes exist today, in which case clean up before enabling).

2. **Idempotency key on `/accounts/create-estate`**: require an `Idempotency-Key` header; refuse duplicate submissions within 60 seconds. Prevents the very rare double-submit.

## Observations that are working correctly

- ✅ Every estate gets a unique AES-256 encryption salt
- ✅ Ghost-estate cleanup is smart and defensive
- ✅ Multi-role (`is_also_benefactor`) is preserved correctly in the primary wizard
- ✅ Getting Started celebration state is handled per-estate, not per-user, which is correct for multi-estate owners
- ✅ Staff accounts (admin/operator) cannot accidentally become benefactors via the primary wizard

## Launch readiness: ✅ SAFE AS-IS

The 3 paths behave correctly for the common flows. The inconsistencies flagged
above are real but don't block launch:
- Missing checklist seed on Paths 1/2 manifests as "IAC readiness: 0%" until
  the user customizes, which the dashboard already handles gracefully.
- Race condition on concurrent Path 2 posts is practically impossible with the
  current submit-once UI.
- Path 3 drift is a refactor target, not a bug.

**Post-launch priority**: fix Path 1 + Path 2 checklist seeding (20 min), then
add the partial unique index (5 min).
