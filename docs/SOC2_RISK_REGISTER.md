# SOC2 Risk Register — accepted / deferred items

Tracks security findings that are knowingly **accepted** or **deferred** with a
documented rationale and compensating controls, per SOC2 CC3.x risk assessment.

---

## RISK-001 — Plaintext localStorage list-cache metadata for offline-first UX
- **Audit ref:** `735b3b7` item #3 (also `5391e8b` #3, prior `4fcd843` #5)
- **Status:** ACCEPTED — re-affirmed by owner Jun 9 2026 (originally Jun 7 2026)
- **Finding:** The offline-first list caches (financial, beneficiary, checklist,
  CCP, DTS, FFN, DAV *metadata*) are written to `localStorage` in plaintext for
  every user, so airplane-mode survival works without opting into "offline
  mode". SOC2 prefers sensitive caches encrypted at rest.

- **Owner decision (Jun 9 2026):** The owner has **explicitly accepted this risk**
  for the current SOC2 cycle and directed that the list-cache encryption NOT be
  implemented, because it is mutually exclusive with a deliberate product
  requirement (synchronous instant-paint, see below). The two cannot coexist:
  WebCrypto is async-only, so encrypting a render-time-read cache necessarily
  removes the synchronous read.

- **Why accepted (not done):**
  1. **Hard UX/product constraint.** `FinancialPortalPage` (and the DAV, FFN,
     Checklist, CCP, DTS pages) read these caches **synchronously at
     component-init** to seed `useState` initializers for a deliberate
     *zero-skeleton instant-paint* on offline cold-boot. Browser crypto is
     **async-only** (no synchronous AES), so encrypting forces those reads
     `await`, collapsing instant-paint into a skeleton flash — a real,
     user-visible regression of an intentional product behavior.
  2. **Marginal security gain.** The encryption key is itself derived from
     `localStorage` (`carryon_enc_seed_v1` device seed + `carryon_token`). An
     attacker with localStorage/disk read access already holds BOTH the
     ciphertext AND the key material, so encrypting a localStorage blob with a
     localStorage-derived key only defeats casual plaintext grepping, not a real
     device-access attacker. (The previously misleading code comments asserting
     "DevTools/disk attackers cannot read this" were corrected in `735b3b7` #3
     to state this accurately.)

- **Compensating controls in place (verified Jun 9 2026):**
  - **No raw secrets are EVER cached.** DAV passwords / `additional_access` /
    free-text `notes` are stripped via an ALLOWLIST sanitizer
    (`sanitizeDavList`, audit d5a54f5e) before any cache write. Only
    non-credential display **metadata** (names, balances, due dates) remains.
    A boot-time self-healing purge (`purgeLeakedDavSecrets`) rewrites any older
    rows that predate the sanitizer.
  - **Logout wipes all caches** — `clearAllLists` removes every
    `carryon_list_cache:*` key on logout (audit fa1ad83 #2), so a shared device
    retains no prior user's payloads.
  - **Pinned document blobs ARE encrypted at rest, fail-closed (`735b3b7` #3).**
    Sensitive SDV document bytes (wills, POAs, credentials) pinned for offline
    use are sealed with AES-256-GCM before touching IndexedDB and are **refused
    (never stored in plaintext)** if a key cannot be derived. This is the
    genuinely sensitive offline payload, and it is protected.
  - **The sync outbox IS encrypted at rest universally** (audit 3be1d2f) — it
    carries raw request bodies (PII), is replayed async, and so has no UX cost.

- **Net residual risk:** What sits in plaintext localStorage is non-credential
  list *metadata* needed for offline display. The two classes of genuinely
  sensitive offline data — credential bytes (pinned docs) and raw write bodies
  (outbox) — are both encrypted at rest. The accepted exposure is therefore
  display metadata on a device the user already controls.

- **Path to remediation (if reclassified to "do"):** a dedicated, full-regression
  project converting the instant-paint pages to a cached-skeleton + async-decrypt
  pattern (or moving the caches into encrypted IndexedDB). Tracked as ROADMAP P2.

- **Re-review:** next SOC2 cycle or when the instant-paint architecture changes.
