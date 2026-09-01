"""One-time repair: re-price historical xAI usage records.

WHY: xAI silently redirects retired model names — grok-4, grok-3, and
grok-3-mini requests have ALL been served by grok-4.3 (confirmed via
response.model, Jun 2026). Our ledgers recorded the REQUESTED name and
priced with retired-model rates, so every historical cost figure is wrong.

WHAT IT DOES (read-only unless --apply):
  * db.xai_usage:       cost_usd re-priced at grok-4.3 rates ($1.25/$2.50 per 1M)
  * db.llm_cost_ledger: estimated_cost_usd re-priced the same way
  * Marks each touched record with repriced_jun2026=True + served_model_assumed
  * Skips records that already carry a served_model (post-fix records are correct)

KNOWN LOWER BOUND: historical records never captured reasoning tokens
(xAI bills them at the output rate but excludes them from
usage.completion_tokens), so true spend is somewhat HIGHER than the
corrected figures.

Usage (Render shell or local):
    cd /app/backend && python scripts/recompute_xai_costs.py            # dry run
    cd /app/backend && python scripts/recompute_xai_costs.py --apply    # write
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

REAL_INPUT = 1.25 / 1_000_000
REAL_OUTPUT = 2.50 / 1_000_000
RETIRED = ["grok-4", "grok-3", "grok-3-mini"]


async def main(apply: bool):
    from config import db

    mode = "APPLY" if apply else "DRY RUN"
    print(f"── recompute_xai_costs [{mode}] ──")

    q = {"model": {"$in": RETIRED}, "served_model": {"$exists": False}}

    rows = await db.xai_usage.find(q, {"_id": 1, "input_tokens": 1, "output_tokens": 1, "cost_usd": 1}).to_list(100000)
    old_total = sum(r.get("cost_usd", 0) or 0 for r in rows)
    new_total = 0.0
    for r in rows:
        new_cost = round(
            (r.get("input_tokens", 0) or 0) * REAL_INPUT + (r.get("output_tokens", 0) or 0) * REAL_OUTPUT, 6
        )
        new_total += new_cost
        if apply:
            await db.xai_usage.update_one(
                {"_id": r["_id"]},
                {"$set": {"cost_usd": new_cost, "served_model_assumed": "grok-4.3", "repriced_jun2026": True}},
            )
    print(f"xai_usage: {len(rows)} records | as-recorded ${old_total:.4f} → corrected ${new_total:.4f}")

    rows = await db.llm_cost_ledger.find(
        q, {"_id": 1, "prompt_tokens": 1, "completion_tokens": 1, "estimated_cost_usd": 1}
    ).to_list(100000)
    old_total_l = sum(r.get("estimated_cost_usd", 0) or 0 for r in rows)
    new_total_l = 0.0
    for r in rows:
        new_cost = round(
            (r.get("prompt_tokens", 0) or 0) * REAL_INPUT + (r.get("completion_tokens", 0) or 0) * REAL_OUTPUT, 6
        )
        new_total_l += new_cost
        if apply:
            await db.llm_cost_ledger.update_one(
                {"_id": r["_id"]},
                {
                    "$set": {
                        "estimated_cost_usd": new_cost,
                        "served_model_assumed": "grok-4.3",
                        "repriced_jun2026": True,
                    }
                },
            )
    print(f"llm_cost_ledger: {len(rows)} records | as-recorded ${old_total_l:.4f} → corrected ${new_total_l:.4f}")
    print("NOTE: corrected figures are a LOWER BOUND (historical reasoning tokens were never recorded).")
    if not apply:
        print("Dry run only — re-run with --apply to write.")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
