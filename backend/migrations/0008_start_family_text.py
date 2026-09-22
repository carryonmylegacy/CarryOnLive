"""0008_start_family_text — retire the "while you're alive" beneficiary line on /start (founder, Sep 22 2026).

The founder replaced "People you invite: free while you're alive" with
"Unlimited beneficiary enrollment — free for your lifetime" on every /start tile and in the
one-plan box (`start.family.text` default). If a Site Copy override of that field still carries
the old phrase, drop it (journaled) so the corrected default shows. Nothing else is touched.
"""

from __future__ import annotations

from datetime import datetime, timezone

KEY = "start.family.text"
RETIRED = ("while you're alive", "while you\u2019re alive")


async def up(db) -> None:
    doc = await db.site_copy.find_one({"_id": KEY}, {"_id": 1, "value": 1})
    if not doc:
        return
    val = str(doc.get("value") or "")
    if not any(p in val for p in RETIRED):
        return
    await db.site_copy_history.insert_one(
        {
            "key": KEY,
            "before": val,
            "after": None,
            "by": "migration:0008_start_family_text",
            "at": datetime.now(timezone.utc).isoformat(),
            "reason": "founder retired 'while you're alive' wording on /start, Sep 22 2026",
        }
    )
    await db.site_copy.delete_one({"_id": KEY})
