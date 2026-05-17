# CarryOn — Efficiency & Reliability Audit (Feb 12, 2026)

**Triggered by**: Completion of Monolith Reduction series (3/6 backend + 4-6/6 frontend). User requested a post-reduction sweep.
**Auditor**: Main agent (E1)
**Scope**: Full codebase (backend + frontend). Read-only assessment + prioritized recommendations.

---

## TL;DR — Health Grade: **A−** (Production-Ready for Live B2B Pitch)

| Category | Status | Notes |
|---|---|---|
| Lint (Ruff + ESLint) | 🟢 PASS | 0 issues across full codebase |
| Housekeeping `--strict` | 🟢 PASS | 0 WARN / 0 FAIL |
| `scripts/check.sh` | 🟢 ALL CLEAR — SAFE TO PUSH | All blocking stages green |
| Backend tests (iter 151) | 🟢 24/24 PASS | Subscription extraction validated |
| Frontend tests (iter 152) | 🟢 0 issues | Monolith reductions validated |
| Service uptime | 🟢 RUNNING | backend / frontend / mongodb all healthy |
| Backend monoliths >1,500 lines | 🟢 0 | All backend extractions complete |
| Frontend monoliths >1,500 lines | 🟡 3 remaining | 1,630 / 1,678 / 1,913 — see §3 |

---

## §1. Monolith Reduction Series — FINAL TALLY

| # | File | Before | After | Δ | Status |
|---|---|---|---|---|---|
| 1 | `backend/routes/documents.py` | 2,318 | 1,180 | −49% | ✅ COMPLETE (prior session) |
| 2 | `backend/routes/guardian.py` | 1,790 | 1,344 | −25% | ✅ COMPLETE (prior session) |
| 3 | `backend/routes/subscriptions/checkout.py` | 1,630 | 838 | −49% | ✅ COMPLETE (iter 151, 24/24 tests) |
| 4 | `frontend/.../EntityOrgChart.js` | 2,536 | 1,630 | −36% | ✅ COMPLETE (iter 152) |
| 5 | `frontend/pages/MessagesPage.js` | 1,926 | 1,913 | −0.7% | 🟡 SAFE EXTRACTION ONLY (state coupling) |
| 6 | `frontend/pages/BeneficiariesPage.js` | 1,747 | 1,678 | −4% | 🟡 SAFE EXTRACTIONS ONLY (form coupling) |

**Net reduction**: 11,947 → 8,583 lines across 6 monoliths (−28%). 8 new sibling modules introduced. **0 behavioral regressions** detected.

---

## §2. Performance Findings (Backend)

### 🟡 P1 — N+1 query pattern in `/admin/user-subscriptions`

**Location**: `/app/backend/routes/subscriptions/admin.py:82-90`

```python
for user in users:  # up to 500 users
    sub = await db.user_subscriptions.find_one({"user_id": user["id"]}, {"_id": 0})
    override = await db.subscription_overrides.find_one({"user_id": user["id"]}, {"_id": 0})
```

**Impact**: 2 sequential round-trips per user × 500 users = 1,000 sequential awaits. At a 5 ms RTT to Mongo, that's ~5 s of pure wait time on a busy admin tab.

**Fix** (~30 LOC, single PR):
```python
user_ids = [u["id"] for u in users]
subs = {s["user_id"]: s for s in await db.user_subscriptions.find({"user_id": {"$in": user_ids}}, {"_id": 0}).to_list(1000)}
overrides = {o["user_id"]: o for o in await db.subscription_overrides.find({"user_id": {"$in": user_ids}}, {"_id": 0}).to_list(1000)}
for user in users:
    user["subscription"] = subs.get(user["id"])
    user["override"] = overrides.get(user["id"])
```

Saves ~995 round-trips. Reduces 5 s → ~50 ms.

### 🟢 Other N+1 candidates found (46 total)

Sampling shows most are bounded by small data sets (≤10 estates per admin call, ≤8 channels for team chat, etc.) — acceptable. The user-subscriptions one is the only at-scale outlier.

Other notable spots worth checking when convenient: `section_permissions.py:51`, `compliance.py:137`, `team_chat.py:44`. None are P1.

### 🟡 P2 — Missing Mongo indexes on hot user-scoped collections

We index `funnel_events`, `download_events`, `referral_*`, `scheduler_locks`, `rate_limits` — but the **most-frequently-queried per-user collections lack explicit indexes**:
- `user_subscriptions.user_id`
- `subscription_overrides.user_id`
- `estates.owner_id`
- `beneficiaries.estate_id` and `beneficiaries.user_id`

Mongo creates collection scans for these by default. At ~500 active users today the cost is invisible; at ~5,000+ this becomes the dominant DB cost.

**Fix**: Add idempotent `create_index` calls in `config.py` startup, or in a one-time `ensure_indexes()` task. ~20 LOC.

---

## §3. Frontend Findings

### 🟡 Files still over the 1,500-line soft threshold (3)

| File | Lines | Path Forward |
|---|---|---|
| `MessagesPage.js` | 1,913 | Structural rewrite: split into `useMessagesData()`, `useMessageDraft()`, `useMessageRecording()` hooks + thin shell. Requires dedicated session with regression test coverage for offline outbox + draft restore. **HIGH RISK to attempt before pitch.** |
| `BeneficiariesPage.js` | 1,678 | Next safe extraction: pull the Add/Edit form (currently inline in SlidePanel, ~450 lines) into `BeneficiaryFormPanel.js`. Requires threading ~25 pieces of state via props — careful but doable in a dedicated session. **MODERATE RISK.** |
| `EntityOrgChart.js` | 1,630 | Already split 5 ways. Next-safest extraction is the toolbar (zoom/center/legend buttons) into `EntityOrgChartToolbar.js`. ~150 lines saved. **LOW RISK** (toolbar is bounded). |

**Recommendation**: Run only the EntityOrgChart toolbar extraction immediately after the pitch (low-risk, brings file under 1,500). Defer MessagesPage and BeneficiariesPage to post-pitch dedicated sessions.

### 🟢 P3 — Files in 1,000–1,500 range (15 future monolith candidates)

```
1492  pages/TrusteePage.js
1465  pages/DashboardPage.js
1427  backend/routes/staff_tools.py
1399  pages/VaultPage.js
1349  pages/ChecklistPage.js
1344  backend/routes/guardian.py     (already split — soft threshold OK)
1340  pages/EstateChatPage.js        (already heavily refactored)
1305  pages/LoginPage.js
1303  pages/print/EntitiesPrintPage.js
1286  components/layout/Sidebar.js
1270  components/layout/MobileNav.js
1259  components/admin/UsersTab.js
1247  backend/routes/digest.py
1244  pages/ConnectedProtocolPage.js
1234  components/financial/entities/EntityDetailPanel.js
```

All under the hard 1,500-line bar. Visit when feature work pauses, not before.

### 🟢 apiClient adoption — COMPLETE

Prior migration replaced direct axios calls in 172 files. Spot-check confirms remaining `import axios from 'axios'` instances are passed as a dependency to `cachedGet(axios, ...)` utility wrappers (which add SWR-style caching + resilience) — this is intentional, not a regression.

### 🟡 P3 — 121 `console.log` / `console.error` calls in `src/`

Mostly intentional dev telemetry (offline-sync state, SSE reconnects). Housekeeping already gates against `console.log` in critical render paths. Future cleanup pass could route these through a `debug()` wrapper that no-ops in production.

---

## §4. Reliability Findings

### 🟢 SSE + polling fallback architecture is sound

`useIacTaskStream.js` hook sends a 16KB padding primer to defeat k8s ingress buffering, then falls back to 8-second polling if events are swallowed. This is exactly the right pattern for PaaS environments — no changes needed.

### 🟢 ProtectedRoute auth gating is well-bounded

Reviewed during the `/financial` redirect investigation (which turned out to be a stale ticket, not a real bug). The redirect logic correctly routes by role: admins → /dashboard, beneficiaries → /beneficiary/dashboard, unauthorized → /login. No silent failures.

### 🟡 P2 — 180 `except Exception` blocks without an explicit `logger` call

Sampling shows most are intentional silent-failure guards (e.g., `localStorage.removeItem` in a `try { } catch {}`) where the error is genuinely safe to swallow. A handful in business-logic paths could swallow real bugs.

**Fix**: One-time sweep with a regex that flags `except Exception:` without an adjacent `logger.` call within 3 lines. Estimate ~20 real fixes hidden in 180 hits.

### 🟢 Stripe webhook signature verification is intact

Confirmed in `checkout.py` extraction — the webhook endpoint remained untouched per the surgical mandate. Signature verification + idempotency logic is still in place. Live revenue paths are safe.

### 🟢 Apple IAP transaction replay-protection is intact

The `apple_transactions` collection is checked before activating subscriptions in the new `apple_iap.py` — replay attacks blocked at the DB level.

---

## §5. Security Findings (Quick Sweep)

### 🟢 No hardcoded secrets in committed code

Housekeeping `--strict` already gates against `sk_live`, `sk_test`, and other secret-looking patterns. PASS.

### 🟢 Ownership guards on estate-scoped routes

Prior audit (handoff iter 150) added explicit `owner_id == current_user["id"]` checks on 20 routes. Spot-check confirms these are still in place after monolith extractions (the extracted routes inherited the guards via the shared router).

### 🟢 Admin-only routes consistently check `current_user.get("role") == "admin"`

Verified across `admin.py`, `subscriptions/admin.py`, `staff_tools.py`. All admin endpoints have explicit role checks.

---

## §6. Prioritized Action List (Post-Pitch)

### 🔴 P0 — Pre-Pitch (NONE needed)
The codebase is pitch-ready. All blocking gates pass. No critical or P0 items outstanding.

### 🟡 P1 — Within 1 week of pitch
1. **Fix N+1 in `/admin/user-subscriptions`** (~30 LOC, 5 s → 50 ms admin tab speedup). § 2.
2. **Add Mongo indexes** for `user_subscriptions.user_id`, `subscription_overrides.user_id`, `estates.owner_id`, `beneficiaries.estate_id`. (~20 LOC, prepares for scale.) § 2.
3. **EntityOrgChart toolbar extraction** (~150 LOC, brings file under 1,500 threshold cleanly). § 3.

### 🟢 P2 — Within 1 month
4. **MessagesPage structural rewrite** — split `handleCreate` + `fetchData` + recording into custom hooks. Dedicated session with regression coverage. § 3.
5. **BeneficiariesPage form panel extraction** — pull the Add/Edit slide-panel form into `BeneficiaryFormPanel.js`. § 3.
6. **`except Exception` audit sweep** — 20 likely-real fixes hidden in 180 hits. § 4.

### 🟢 P3 — When feature work pauses
7. Routes the 15 files in the 1,000–1,500 range through targeted constants/sub-component extractions. § 3.
8. Route `console.log` calls through a `debug()` wrapper. § 3.

### 🔴 P1 — User/Third-Party Action Blocked
- Apple IAP — awaiting Developer Agreement approval.
- Twilio SMS — awaiting A2P 10DLC campaign approval.

---

## §7. What Was NOT Touched (By Design)

Per the user's "surgical, no shortcuts, no regression" mandate, the following demo-critical surfaces were explicitly left untouched during the monolith series:

- All Stripe revenue paths (checkout, webhook, change-plan, change-billing, cancel) inside `checkout.py`.
- The `EntityOrgChart` main component body (drag, zoom, edge rendering, modal portals).
- The `MessagesPage` component body (offline outbox, draft persistence, recording state machine).
- The `BeneficiariesPage` Add/Edit form modal.

These are the right calls. Premature optimization on demo-critical code paths before a live pitch is how revenue gets broken.

---

## §8. Verification Trail

| Gate | Result | Evidence |
|---|---|---|
| ESLint (full codebase) | 0 issues | `scripts/check.sh` Stage 3/5 PASS |
| Ruff (backend) | 0 issues | `scripts/check.sh` Stage 2/5 PASS |
| Housekeeping `--strict` | 0 WARN / 0 FAIL | All checks PASS |
| Backend integration tests | 24/24 PASS | `/app/test_reports/iteration_151.json` |
| Frontend smoke (post-monolith) | 100% render, 0 errors | `/app/test_reports/iteration_152.json` |
| Service health | All running | `supervisorctl status` |

---

## §9. Sign-Off

The codebase is **production-ready for the live B2B pitch**. No P0 items remain. The three frontend monoliths that didn't fully reduce are flagged with clear path-forward plans, all of which are LOWER RISK to execute AFTER the pitch.

— Audit completed Feb 12, 2026, 04:10 UTC
