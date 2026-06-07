# SOC2 Risk Register — accepted / deferred items

Tracks security findings that are knowingly **accepted** or **deferred** with a
documented rationale and compensating controls, per SOC2 CC3.x risk assessment.

---

## RISK-001 — Plaintext localStorage list-cache metadata for offline-first UX
- **Audit ref:** `5391e8b` item #3 (and prior `4fcd843` #5)
- **Status:** ACCEPTED / DEFERRED (owner decision, Jun 7 2026)
- **Finding:** The offline-first list caches (financial, beneficiary, checklist,
  CCP, DTS, FFN, DAV *metadata*) are written to `localStorage` in plaintext for
  every user, so airplane-mode survival works without opting into "offline
  mode". SOC2 prefers sensitive caches encrypted at rest.

- **Why deferred (not done now):**
  1. **No-negative-effect constraint.** `FinancialPortalPage` reads these caches
     **synchronously at component-init** to seed 8 `useState` initializers for a
     deliberate *zero-skeleton instant-paint*. Browser crypto (WebCrypto) is
     **async-only** — there is no synchronous AES — so encrypting these caches
     forces those reads `await`, collapsing instant-paint into a skeleton flash.
     That is a real UX regression, and the owner's standing constraint is "only
     if it won't negatively affect anything."
  2. **Marginal security gain.** The encryption key is itself derived from
     `localStorage` (`carryon_enc_seed_v1` device seed + `carryon_token`). An
     attacker with localStorage read access already has both the ciphertext and
     the key material, so encrypting a localStorage blob with a localStorage-
     derived key only defeats casual plaintext grepping, not a real device-access
     attacker.

- **Compensating controls already in place:**
  - **No raw secrets are cached.** DAV passwords / `additional_access` / notes
    are sanitized out before any cache write (`sanitizeDavList`, audit d5a54f5e).
    What remains is non-credential **metadata** (names, balances, due dates).
  - **Logout wipes all caches** — `clearAllLists` clears every
    `carryon_list_cache:*` key on logout (audit fa1ad83 #2).
  - **The outbox (which *does* carry raw request bodies) IS encrypted at rest**
    universally (audit 3be1d2f) — its replay path is async-native, so there is
    no UX cost there.

- **Path to remediation (if reclassified to "do"):** a dedicated, full-regression
  project converting the instant-paint pages to a cached-skeleton + async-decrypt
  pattern (or moving the caches to encrypted IndexedDB). Tracked as ROADMAP P2.

- **Re-review:** next SOC2 cycle or when the instant-paint architecture changes.
