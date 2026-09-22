"""0006_unlimited_beneficiaries — every tier has unlimited beneficiaries (founder, Sep 22 2026).

Two stored plan bullets from the original March 2026 defaults implied a cap: Base said
"Beneficiary management (up to 3)" and Premium sold "Unlimited beneficiaries" as an upgrade.
Nothing in the code ever enforced a limit. Base now states the truth (inherited upward via
"Everything in Base"); Premium's bullet becomes its real differentiator per the feature gates.
Exact-match only, so founder-edited bullets are left alone.
"""

from __future__ import annotations

REPLACEMENTS = {
    "base": {"Beneficiary management (up to 3)": "Unlimited beneficiaries"},
    "premium": {
        "Unlimited beneficiaries": "Every CarryOn tool \u2014 Financial Picture, Digital Access Vault, Comms Tool and more"
    },
}


async def up(db) -> None:
    settings = await db.subscription_settings.find_one({"_id": "global"}, {"plans": 1})
    plans = (settings or {}).get("plans")
    if not plans:
        return
    changed = False
    for plan in plans:
        table = REPLACEMENTS.get(plan.get("id"))
        feats = plan.get("features") or []
        if table and any(f in table for f in feats):
            plan["features"] = [table.get(f, f) for f in feats]
            changed = True
    if changed:
        await db.subscription_settings.update_one({"_id": "global"}, {"$set": {"plans": plans}})
