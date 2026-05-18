# Backup & Restore Drill — Operator Runbook

**Audience:** CarryOn ops/CTO on-call. Do not delegate to external contractors.
**Cadence:** Quarterly (Q1/Q2/Q3/Q4), evidence captured for SOC 2 CC7.2 + A1.2.
**RTO target:** ≤ 60 min (full-database restore to a staging cluster).
**RPO target:** ≤ 24 hours (Atlas continuous backups; point-in-time within retention window).

---

## 1. Why we drill

A backup that has never been restored is not a backup — it's an unverified
hope. SOC 2 CC7.2 and A1.2 require operators to demonstrate, at least
annually, that recovery objectives are achievable. Quarterly here gives us
4 documented restores per year and 3 chances to catch a regression before
audit season.

## 2. Pre-drill checklist (T-24h)

- [ ] Confirm latest snapshot exists in Atlas (Atlas UI → Backup → Snapshots).
- [ ] Verify retention window covers desired PIT (default 7 days continuous,
      monthly snapshots for 12 months).
- [ ] Slack `#ops` heads-up so on-call doesn't page during the drill.
- [ ] Open a fresh entry in `/app/memory/INCIDENT_RUNBOOK.md` titled
      `Backup Drill YYYY-MM-DD` to capture timeline + screenshots.

## 3. Drill procedure

### Step 1 — Spin up the restore target (~5 min)
1. Atlas UI → Backup → Snapshots → pick the most recent **non-current**
   snapshot (so a still-running drill never collides with prod indexes).
2. Restore to a **new** cluster named `carryon-drill-YYYY-MM-DD`
   (M10 tier is enough; we tear it down at the end).
3. **Do NOT** restore over the production cluster. Ever.

### Step 2 — Wait for restore to complete (~15–25 min)
1. Atlas shows progress; expect 15–25 min for a database of our current size.
2. Capture the elapsed minutes — this is your **measured RTO** for the drill.

### Step 3 — Smoke test the restored cluster (~10 min)
1. Get the restored cluster's connection string and put it in a *local-only*
   env file. Do NOT commit it.
2. Run the read-only smoke pack:
   ```bash
   MONGO_URL='<restored-uri>' DB_NAME=carryon \
     python /app/backend/scripts/backup_drill_smoke.py
   ```
   This script (a) counts every critical collection, (b) verifies the
   audit-trail hash chain via `services.audit.verify_audit_chain`, and
   (c) cross-references the latest 5 estates against their owners.
3. Expected output: `OK: 18 collections, chain verified, 5/5 estates intact`.
4. Any failure: STOP. Document failure mode, escalate to CTO, do NOT
   continue to teardown.

### Step 4 — Sample-restore one record into a sandbox (optional)
1. Use this drill to also rehearse a *partial* restore: pick one user from
   the restored cluster, copy their estate + documents into a local sandbox
   DB, and walk through a fake "user lost data" support flow.
2. Document any friction in `/app/memory/INCIDENT_RUNBOOK.md`.

### Step 5 — Tear down (~5 min)
1. Atlas UI → cluster → Terminate. Confirm by typing the cluster name.
2. Verify billing dashboard the next day shows the drill cluster as
   `terminated` and no longer accruing charges.

## 4. Evidence to capture (mandatory)

- [ ] Screenshot of snapshot selection screen showing snapshot timestamp.
- [ ] Screenshot of restore completion screen showing elapsed time.
- [ ] Plain-text output of `backup_drill_smoke.py` (paste into the drill log).
- [ ] Final cluster-terminated screenshot.
- [ ] Names + roles of everyone who participated.

Store all evidence under `/app/memory/screenshots/backup_drill_YYYY-MM-DD/`
and reference it in the SOC 2 control evidence index.

## 5. Pass criteria

A drill passes only if **ALL** of the following are true:

| Criterion | Threshold |
|-----------|-----------|
| Snapshot restored successfully | binary |
| Restore elapsed time | ≤ 60 min |
| Smoke pack exit code | 0 |
| Audit-trail hash chain verifies | `verify_audit_chain().ok == True` |
| All critical collections present | `users, estates, documents, audit_trail, llm_cost_ledger, emergency_plans` |
| Cluster terminated within 24h | manual check |

If any criterion fails, the drill is marked `FAIL` and the next drill is
scheduled within 30 days (not 90).

## 6. Roles

- **Drill lead:** CTO or designated SRE. Owns the runbook, the timeline,
  and the evidence package.
- **Reviewer:** Founder. Signs off the evidence package in Slack `#ops`.
- **Auditor:** External SOC 2 auditor (annually). Reviews the last 4
  drill packages.

## 7. Reference

- Atlas backup docs: https://www.mongodb.com/docs/atlas/backup/cloud-backup/overview/
- Existing infra notes: `/app/memory/MONGODB_ATLAS_BACKUP_GUIDE.md`
- Hash-chain verifier: `backend/services/audit.py` → `verify_audit_chain()`
- SOC 2 controls index: `/app/memory/SECURITY_POSTURE.md`

---

**Last revision:** Feb 2026 (initial drill runbook authored as part of the
P2 SOC 2 readiness sweep).
