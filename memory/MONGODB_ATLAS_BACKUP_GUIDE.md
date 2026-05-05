# MongoDB Atlas Backup Cost Optimization — Step-by-Step Walkthrough

**Audience**: Barnet (founder, no DBA experience required)
**Goal**: Cut MongoDB Atlas backup costs by ~60–80% without losing meaningful disaster recovery
**Estimated time**: 10 minutes

## TL;DR — what you're going to do

1. Turn **OFF** "Continuous Cloud Backup" (oplog-level second-by-second backup). You don't need point-in-time restore for a pre-revenue platform.
2. Keep daily snapshots, prune the retention so old snapshots don't pile up forever.
3. Verify the new policy looks right.
4. Wait ~24 hours and recheck the bill estimate.

## Before you click anything — the safety rule

**Do NOT delete any existing snapshot manually until you've confirmed your new automated policy has produced at least one good snapshot.** The new policy will start running tonight; tomorrow morning you'll have at least one snapshot under the new rules. That's the moment it's safe to clean up the old ones.

## Step 1 — Open Atlas and navigate to Backup

1. Go to **https://cloud.mongodb.com** and log in.
2. Pick your **Project** from the top-left dropdown (the one that contains the `carryon` cluster).
3. In the left sidebar, click **Database** (or **Clusters**).
4. Click the **`...`** (three dots) next to the cluster name → **Edit Configuration** → **Additional Settings** → look for **Backup**. Or on the cluster row, click **Backup** directly.

If you see two clusters (e.g., `carryon-prod` and `carryon-staging`), do this on the **prod** one only. We'll address staging separately if needed.

## Step 2 — Turn OFF Continuous Cloud Backup (PITR)

This is the biggest cost driver and you don't need it.

1. On the cluster's Backup tab, look for **"Continuous Cloud Backup"** (sometimes called **PITR — Point-In-Time Recovery**).
2. If it shows **Enabled**, click the toggle to disable it. Confirm the warning dialog.
3. **Why this is safe**: PITR keeps the oplog (every write, second-by-second) for the configured retention window so you can restore to any moment in time. Pre-revenue with low write volume, you don't need second-precision restore. Daily snapshots are enough.

## Step 3 — Edit the Snapshot Retention Policy

You'll see a section called something like **"Snapshot Schedule"** or **"Backup Policy"**. It typically has rows like:

| Frequency      | Retention      | Recommended setting           |
|----------------|----------------|-------------------------------|
| Hourly         | (varies)       | **DISABLED / Off**            |
| Every 6 hours  | 2 days         | **DISABLED / Off**            |
| Daily          | 7 days         | **Keep — 7 days**             |
| Weekly         | 4 weeks        | **Keep — 4 weeks**            |
| Monthly        | 12 months      | **Reduce to 6 months**        |
| Yearly         | (often off)    | **Off** (set up manually next year if you need annual archives) |

For each row:
- Click **Edit** (or the pencil icon).
- Set **Frequency** + **Retention** to match the recommended column.
- Save.

If the UI presents a single dropdown with preset policies (e.g., "Standard", "High-Resilience", "Cost-Optimized"), pick **Cost-Optimized** and you're done — Atlas will do the right thing.

## Step 4 — Review and save

1. Scroll to the bottom and click **Review Changes** (or **Save**).
2. Atlas will show you a diff: what's being added, removed, retained.
3. Confirm and apply.

## Step 5 — Wait ~24 hours, then clean up old snapshots

After the new policy has run for a day:

1. Go back to the same Backup tab.
2. Click **Manage Snapshots** (or browse the snapshot list).
3. You'll see all existing snapshots. Anything older than your new retention window (e.g., daily snapshots older than 7 days, weekly older than 4 weeks, monthly older than 6 months) can be **deleted** to stop paying for storage.
4. **Keep at least 1 weekly + 1 monthly that you trust.** When in doubt, leave a snapshot alone — storage for a single old snapshot is cheap; deleting one you needed costs your whole company.

## Step 6 — Verify cost savings on the next invoice

- Atlas updates the cost estimator within ~24 hours.
- Go to **Billing** → **Pending Invoice** to see the projected new monthly total.
- Expected reduction: **60–80%** of your current backup line item if PITR was on.

## What to do if something goes wrong

- **"Restore from backup failed"** — open a support ticket from inside Atlas (top-right help icon → Support). Atlas support is responsive even on free-tier projects. Quote your cluster name.
- **"I deleted a snapshot I needed"** — Atlas keeps deleted snapshots in a soft-delete state for ~24 hours. Open support immediately and ask them to recover it. Don't wait.
- **"I'm not sure which cluster to edit"** — send me the cluster names from your Atlas dashboard and I'll tell you which is prod.

## What I'd suggest setting up next (optional, ~5 min more)

1. **Billing alert**: Atlas → Project Settings → Alerts → Add Alert → "Bill exceeds $X" → set X to ~120% of your current monthly bill. Catches surprise spikes.
2. **Manual snapshot before any major migration**: Before you push schema changes, hit "Take Snapshot Now" in the Backup tab. Costs pennies, sleeps well at night.

---

**Last updated**: May 5, 2026
**Author**: E1 agent (per founder request)
