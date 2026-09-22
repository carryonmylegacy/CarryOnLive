"""0007_seniors_card_copy — Seniors card lists only what it adds beyond Standard (founder, Sep 22 2026).

The stored Seniors bullets repeated three things "Everything in Standard" already covers
(Milestone Messages is in Base; Estate Guardian analysis and Expanded vault storage are in
Standard). Per the live feature gates, Seniors adds DAV, DTS and the Estate Plan Timeline on
top of Standard, at a reduced rate for ages 65+. Exact-match on the whole list, so a
founder-edited card is left alone.
"""

from __future__ import annotations

OLD = [
    "Everything in Standard",
    "Milestone Messages",
    "Estate Guardian analysis",
    "Expanded vault storage",
]
NEW = [
    "Everything in Standard",
    "Digital Access Vault",
    "Designated Trustee Services",
    "Estate Plan Timeline",
    "Reduced rate for ages 65+",
]


async def up(db) -> None:
    settings = await db.subscription_settings.find_one({"_id": "global"}, {"plans": 1})
    plans = (settings or {}).get("plans")
    if not plans:
        return
    for plan in plans:
        if plan.get("id") == "seniors" and plan.get("features") == OLD:
            plan["features"] = NEW
            await db.subscription_settings.update_one({"_id": "global"}, {"$set": {"plans": plans}})
            return
