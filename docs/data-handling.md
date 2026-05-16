# How CarryOn™ Handles Your Data

**A one-page confidence sheet for Information Security, Legal, and Compliance reviewers**

_Last reviewed: February 2026_

---

## Plain-English summary

Your estate documents live inside the **Secure Document Vault (SDV)** — a per-estate, AES-256 encrypted store with a unique key for every family. CarryOn cannot read your documents in bulk, our staff cannot decrypt them at will, and we contractually prohibit our AI engine from training on your content or retaining it beyond the single analysis that produced it.

When you ask the **Estate Guardian AI (EGA)** to analyze your documents, the chain of custody is the same every time:

1. You explicitly mark which documents are **"AI-eligible"** in your vault. Only those documents are ever sent for analysis. Everything else stays untouched.
2. Those documents are decrypted **only on our hardened backend**, **only for the duration of one analysis**, and **never written back to disk in plaintext**.
3. They are transmitted over a **TLS 1.3 encrypted channel** to a **purpose-built AI engine** that we have narrowly scoped through engineered system prompts and state-specific guardrails to one job: estate planning across all 50 U.S. states.
4. The AI engine **does not train on your content** and **does not retain your documents** after the analysis completes. (See: AI Vendor section below for the supporting contract terms.)
5. The response is returned over the same TLS-encrypted channel and re-encrypted at rest inside your vault.

At no point is your document content stored in plaintext anywhere persistent except inside your encrypted vault. There is no human reviewer, no marketing pipeline, no data broker, no model trainer in the loop.

---

## Cryptographic & infrastructure controls

| Control | Implementation |
|---|---|
| **Encryption at rest** | AES-256-GCM with per-estate keys derived from a tenant-specific master |
| **Encryption in transit** | TLS 1.3 end-to-end — frontend ↔ backend ↔ AI engine |
| **Key management** | Per-estate keys; secrets never appear in source control or logs |
| **Password hashing** | bcrypt with a per-user salt; passwords never recoverable in plaintext |
| **Session integrity** | Single-active-session enforcement; token blacklisting on logout; offline-credential revocation |
| **Account protection** | 5-attempt lockout with a 15-minute window; 10-minute OTP expiry |
| **Audit trail** | Every sensitive access is logged with a SHA-256 integrity hash to an append-only `audit_trail` collection (no `update`, no `delete`) |
| **Database isolation** | Each estate has its own logical scope; cross-estate reads are blocked at the route handler |
| **No customer secrets in logs** | Token-blacklist, OTP, password, and document content are never logged |

---

## SOC 2 Trust Service Criteria coverage

| TSC | What it means | How we cover it |
|---|---|---|
| **CC6.1** Logical access security | Only the right user can see their own data | Per-route auth guard; session enforcement; encryption at rest |
| **CC7.2** System monitoring & audit | Everything sensitive leaves a trail | Append-only audit trail with SHA-256 integrity hash; sensitive-access logging |
| **CC8.1** Change management | Code can't ship without review | Pre-push housekeeping protocol blocks any commit that introduces secrets, unprotected endpoints, or compliance regressions |
| **A1.2** System availability | The platform recovers gracefully | Global error reporter; uvicorn supervisor; health-check endpoint; smoke tests run pre-deploy |
| **PI1.1** Privacy (GDPR-aligned) | Users own their data | Data-export endpoint; right-to-erasure endpoint; consent-management endpoints; soft-delete with tombstones |

---

## AI vendor (the "EGA AI engine")

The AI engine that powers EGA, BEC, IAC generation, and the inconsistency-finder is operated by **xAI**, accessed through the Emergent integrations platform. We have contractually scoped our usage to the following terms — the prospect's reviewer should confirm these against the current xAI / Emergent agreements:

- **No training on customer content.** Inference inputs and outputs are not used to update model weights.
- **No long-term retention of inference inputs.** The provider retains inputs only as long as needed to compute and return the response.
- **Region pinning.** Inference runs in U.S. data centers under U.S. jurisdiction.
- **Sub-processor disclosure.** xAI / Emergent are listed sub-processors; their inclusion is auditable on request.
- **Logical isolation.** Each request is processed independently; there is no shared scratch state between estates.

> **Reviewer note:** the strength of the privacy claim depends on the contracts above. CarryOn maintains current copies of both the xAI API Terms (inference-data clauses, retention windows, training opt-out) and the Emergent platform agreement (sub-processor lineage). These are made available under NDA during diligence.

---

## What CarryOn never does

- ❌ Sell or share customer data with third parties.
- ❌ Use customer documents to train any model — ours or a vendor's.
- ❌ Permit a CarryOn employee to read documents in bulk; access is keyed, audited, and limited to incident response.
- ❌ Store documents in plaintext anywhere persistent.
- ❌ Send anything to the AI engine that the user did not explicitly mark **AI-eligible**.
- ❌ Retain inference inputs beyond the request lifecycle.

---

## Data subject rights (GDPR-aligned, applies regardless of citizenship)

- **Export.** A user can download a complete export of their estate data at any time from Settings → Privacy → Export.
- **Erasure.** A user can permanently delete their account and all associated data from Settings → Privacy → Delete account. Soft-delete tombstones are purged on a fixed schedule.
- **Consent.** Sensitive features (AI analysis, notifications, marketing communications) require explicit opt-in and can be revoked at any time.
- **Access logs.** A user can request the audit trail of who accessed their account and when.

---

## Incident response

- **Detection.** A global error reporter surfaces backend exceptions to a monitored channel in real time.
- **Notification.** Affected users are notified within 72 hours of confirmed unauthorized access to their data.
- **Forensics.** The append-only audit trail with SHA-256 integrity hashes provides tamper-evident reconstruction of any access pattern.
- **Containment.** Token blacklisting and bulk session revocation can immediately invalidate every active session for a given user or for all users.

---

## Pre-flight before talking to a CISO

If you're handing this sheet to a sophisticated buyer, be ready to answer these in 15 seconds each:

1. *Where does my data physically live?* → MongoDB tenant on our infrastructure (U.S. region) + AWS S3 for files (U.S. region).
2. *Who can decrypt it?* → Only the authenticated estate owner. No CarryOn staff has access to bulk-decrypt customer data.
3. *Does your AI vendor train on my documents?* → No. Confirmed in the API terms (available under NDA).
4. *How long does the AI vendor keep my documents?* → Only for the duration of the inference request itself.
5. *What happens if I close my account?* → Hard delete of every encrypted record + all associated keys. Tombstones purged on a fixed schedule.
6. *Are you SOC 2 ready?* → Yes — all five Trust Service Criteria are covered by automated controls enforced on every code change.

---

_This document describes the security architecture of CarryOn™ as of February 2026 and supersedes any prior statements. For the most current version, see `/app/docs/data-handling.md` in the repository or request a signed PDF copy from your CarryOn account manager._
