"""0005_plan_card_copy — pricing-card bullet corrections (founder decisions, Sep 22 2026).

Plan `features` are founder-owned once stored (Admin → Finance → Subs → plan
editor), so DEFAULT_PLANS edits never reach an existing deployment. This applies
the two agreed text changes once, exact-match only, so any bullet the founder
has already reworded is left alone:

* Base DOES include Milestone Messages (matches the feature gates) — the bullet
  moves from the Standard card to the Base card.
* "Priority human support (CST)" → spells out the Customer Service Team so CST
  is not read as Central time.
"""

from __future__ import annotations

OLD_CST = "Priority human support (CST)"
NEW_CST = "Priority human support from our Customer Service Team (CST)"
MM = "Milestone Messages"


async def up(db) -> None:
    settings = await db.subscription_settings.find_one({"_id": "global"}, {"plans": 1})
    plans = (settings or {}).get("plans")
    if not plans:
        return
    changed = False
    for plan in plans:
        feats = plan.get("features") or []
        if plan.get("id") == "premium" and OLD_CST in feats:
            plan["features"] = [NEW_CST if f == OLD_CST else f for f in feats]
            changed = True
        elif plan.get("id") == "standard" and MM in feats:
            plan["features"] = [f for f in feats if f != MM]
            changed = True
        elif plan.get("id") == "base" and MM not in feats:
            vault_idx = next((i for i, f in enumerate(feats) if "Vault" in f), len(feats) - 1)
            feats.insert(vault_idx + 1, MM)
            plan["features"] = feats
            changed = True
    if changed:
        await db.subscription_settings.update_one({"_id": "global"}, {"$set": {"plans": plans}})
