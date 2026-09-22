"""0004_ffn_base_standard — open the Who-to-notify list (FFN) to Base and Standard.

Founder decision, Sep 22 2026: the homepage sells "Who to notify" as one of the
12 core tools, so it must not be Premium-only. Flips the two gate cells once;
the founder can still change them afterwards in Admin → Finance → Subs →
Feature Gates (this migration is recorded and never re-applied).
"""

from __future__ import annotations


async def up(db) -> None:
    settings = await db.subscription_settings.find_one({"_id": "global"}, {"feature_gates": 1})
    if not settings or "feature_gates" not in settings:
        return  # defaults (every non-default_off feature ON) already include FFN for all tiers
    await db.subscription_settings.update_one(
        {"_id": "global"},
        {"$set": {"feature_gates.ffn.base": True, "feature_gates.ffn.standard": True}},
    )
